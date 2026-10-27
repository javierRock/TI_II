export async function withTransaction(pool, operation) {
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query('BEGIN');
    await client.query('SET @actor_usuario_id = NULL, @actor_proceso = NULL');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      releaseError = rollbackError;
    }
    throw error;
  } finally {
    try {
      await client.query('SET @actor_usuario_id = NULL, @actor_proceso = NULL');
    } catch (error) {
      releaseError = error;
    }
    client.release(releaseError);
  }
}
