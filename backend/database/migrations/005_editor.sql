-- El editor gráfico no modifica reservas, préstamos, contraseñas ni auditoría.
GRANT SELECT ON personas TO 'prestamos_editor'@'%';
GRANT SELECT ON tipos_bien TO 'prestamos_editor'@'%';
GRANT SELECT ON bienes TO 'prestamos_editor'@'%';
GRANT SELECT ON unidades_inventario TO 'prestamos_editor'@'%';
GRANT SELECT ON reservas TO 'prestamos_editor'@'%';
GRANT SELECT ON prestamos TO 'prestamos_editor'@'%';
GRANT SELECT ON politicas_prestamo TO 'prestamos_editor'@'%';
GRANT SELECT ON eventos_historial TO 'prestamos_editor'@'%';
GRANT SELECT ON planes_estudio TO 'prestamos_editor'@'%';
GRANT SELECT ON perfiles_academicos TO 'prestamos_editor'@'%';
GRANT SELECT(id,persona_id,nombre_usuario,rol,activo,atribucion_admin) ON usuarios TO 'prestamos_editor'@'%';
GRANT UPDATE(nombre_completo,correo,contacto) ON personas TO 'prestamos_editor'@'%';
GRANT UPDATE(nombre,descripcion,autor,edicion,isbn) ON bienes TO 'prestamos_editor'@'%';
