import { actorTransaction } from '../../db/actor-transaction.js';
import { hashPassword } from '../../core/seguridad.js';
import { HttpError, requireRecord } from '../../shared/errors.js';
import * as repository from './personas.repository.js';

export async function personDetail(pool, id) {
  const person = requireRecord(await repository.findPerson(pool, id));
  const account = await repository.findAccount(pool, id);
  return { ...person, cuenta: account ? { ...account, perfiles: await repository.profiles(pool, account.id) } : null };
}

async function validateProfile(client, input) {
  if (input.tipo === 'estudiante' && !await repository.validSemester(client, input.plan_id, input.semestre)) {
    throw new HttpError(400, 'El semestre no pertenece a un plan de estudios activo', 'PERFIL_INVALIDO');
  }
}

export const createPerson = (pool, auth, input) => actorTransaction(pool, auth, (client) => repository.insertPerson(client, input));
export const createPlan = (pool, auth, input) => actorTransaction(pool, auth, (client) => repository.insertPlan(client, input));
export function editPerson(pool, auth, id, input) {
  return actorTransaction(pool, auth, async (client) => {
    const current = requireRecord(await repository.findPerson(client, id, { lock: true }));
    return repository.updatePerson(client, id, input, current);
  });
}
export function setPersonState(pool, auth, id, input) {
  return actorTransaction(pool, auth, async (client) => {
    requireRecord(await repository.findPerson(client, id, { lock: true }));
    return repository.setPersonState(client, id, input.activo);
  });
}
export async function createAccount(pool, auth, personId, input) {
  // Argon2 fuera de la transacción para no mantener bloqueos durante el cálculo.
  const hash = await hashPassword(input.password);
  return actorTransaction(pool, auth, async (client) => {
    const person = requireRecord(await repository.findPerson(client, personId, { lock: true }));
    if (!person.activo) throw new HttpError(409, 'Activa la persona antes de crear su cuenta');
    if (await repository.findAccount(client, personId)) throw new HttpError(409, 'La persona ya tiene una cuenta');
    if (input.perfil) await validateProfile(client, input.perfil);
    const account = await repository.insertAccount(client, personId, input, hash);
    if (input.perfil) await repository.upsertProfile(client, account.id, input.perfil);
    return { ...account, perfiles: await repository.profiles(client, account.id) };
  });
}
export function editAccount(pool, auth, personId, input) {
  return actorTransaction(pool, auth, async (client) => {
    const person = requireRecord(await repository.findPerson(client, personId, { lock: true }));
    const account = requireRecord(await repository.findAccount(client, personId, { lock: true }), 'La persona no tiene cuenta');
    if (input.activo === true && !person.activo) throw new HttpError(409, 'Una cuenta activa requiere una persona activa');
    if (input.rol && input.rol !== 'personal_administrativo') {
      const profile = (await repository.profiles(client, account.id)).find((item) => item.tipo === input.rol);
      if (!profile) throw new HttpError(409, 'Registra primero el perfil del nuevo rol');
      await validateProfile(client, profile);
    }
    return repository.setAccountState(client, account, input);
  });
}
export function saveProfile(pool, auth, personId, input) {
  return actorTransaction(pool, auth, async (client) => {
    requireRecord(await repository.findPerson(client, personId, { lock: true }));
    const account = requireRecord(await repository.findAccount(client, personId, { lock: true }), 'La persona no tiene cuenta');
    await validateProfile(client, input);
    return repository.upsertProfile(client, account.id, input);
  });
}
