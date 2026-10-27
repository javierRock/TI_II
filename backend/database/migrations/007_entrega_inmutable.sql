DROP TRIGGER prestamo_cerrado;
DELIMITER $$
CREATE TRIGGER prestamo_cerrado BEFORE UPDATE ON prestamos FOR EACH ROW
BEGIN
 IF OLD.estado_cierre='devuelto' OR NEW.id<>OLD.id OR NEW.solicitante_id<>OLD.solicitante_id
 OR NEW.unidad_id<>OLD.unidad_id OR NEW.inicio<>OLD.inicio OR NEW.vencimiento<>OLD.vencimiento
 OR NOT(NEW.reserva_id<=>OLD.reserva_id) OR NEW.autorizado_por<>OLD.autorizado_por
 OR NEW.modalidad<>OLD.modalidad OR NEW.condicion_entrega<>OLD.condicion_entrega
 OR NOT(NEW.accesorios_entrega<=>OLD.accesorios_entrega)
 OR NOT(NEW.observaciones_entrega<=>OLD.observaciones_entrega)
 OR NEW.politica_condiciones_id<>OLD.politica_condiciones_id OR NEW.politica_cupo_id<>OLD.politica_cupo_id
 OR NEW.rol_origen<>OLD.rol_origen OR NEW.cupo_aplicado<>OLD.cupo_aplicado
 OR NEW.duracion_max_horas<>OLD.duracion_max_horas OR NEW.garantia_exigida<>OLD.garantia_exigida
 OR NEW.renovacion_permitida<>OLD.renovacion_permitida OR NEW.max_renovaciones<>OLD.max_renovaciones
 OR NEW.tolerancia_horas<>OLD.tolerancia_horas OR NEW.tarifa_diaria<>OLD.tarifa_diaria
 OR NEW.creado_en<>OLD.creado_en THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La entrega y sus condiciones históricas son inmutables'; END IF;
END$$
DELIMITER ;
