CREATE VIEW v_prestamos_estado AS
SELECT p.*, CASE WHEN estado_cierre='devuelto' THEN 'devuelto'
 WHEN vencimiento<=UTC_TIMESTAMP(6) THEN 'vencido' ELSE 'activo' END AS estado,
 GREATEST(0,TIMESTAMPDIFF(MICROSECOND,vencimiento,COALESCE(devolucion_en,UTC_TIMESTAMP(6)))/1000000) AS retraso_segundos,
 GREATEST(0,TIMESTAMPDIFF(MICROSECOND,vencimiento,COALESCE(devolucion_en,UTC_TIMESTAMP(6)))/1000000-tolerancia_horas*3600) AS exceso_tolerancia_segundos
FROM prestamos p;
CREATE VIEW v_disponibilidad_actual AS
SELECT u.id AS unidad_id,u.codigo_inventario,b.id AS bien_id,b.nombre,t.codigo AS tipo_codigo,t.nombre AS tipo_nombre,
 u.ubicacion,u.estado,(u.estado='disponible' AND t.habilitado AND NOT EXISTS
 (SELECT 1 FROM prestamos p WHERE p.unidad_id=u.id AND p.estado_cierre='abierto')) AS disponible
FROM unidades_inventario u JOIN bienes b ON b.id=u.bien_id JOIN tipos_bien t ON t.id=b.tipo_id;
