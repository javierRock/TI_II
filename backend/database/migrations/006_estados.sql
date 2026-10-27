DELIMITER $$
CREATE TRIGGER reserva_transiciones BEFORE UPDATE ON reservas FOR EACH ROW
BEGIN
 IF NEW.solicitante_id<>OLD.solicitante_id OR NEW.unidad_id<>OLD.unidad_id OR NEW.inicio<>OLD.inicio OR NEW.fin<>OLD.fin
 OR (NEW.estado<>OLD.estado AND NOT (
 (OLD.estado='pendiente' AND NEW.estado IN ('confirmada','rechazada','cancelada','vencida'))
 OR (OLD.estado='confirmada' AND NEW.estado IN ('atendida','cancelada','vencida')))) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Transición de reserva no permitida'; END IF;
END$$
CREATE TRIGGER unidad_transiciones BEFORE UPDATE ON unidades_inventario FOR EACH ROW
BEGIN
 IF OLD.estado='baja' OR (OLD.estado='prestada' AND NEW.estado<>'prestada' AND EXISTS(SELECT 1 FROM prestamos WHERE unidad_id=OLD.id AND estado_cierre='abierto')) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Unidad de baja o con préstamo abierto'; END IF;
END$$
CREATE TRIGGER usuario_persona_activa BEFORE INSERT ON usuarios FOR EACH ROW
BEGIN
 IF NEW.activo AND NOT EXISTS(SELECT 1 FROM personas WHERE id=NEW.persona_id AND activo) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La persona debe estar activa'; END IF;
END$$
DELIMITER ;
