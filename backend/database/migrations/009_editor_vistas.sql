-- Lectura del soporte académico y de los estados derivados, sin permisos de edición.

GRANT SELECT ON semestres_plan TO 'prestamos_editor'@'%';
GRANT SELECT ON v_prestamos_estado TO 'prestamos_editor'@'%';
GRANT SELECT ON v_disponibilidad_actual TO 'prestamos_editor'@'%';
