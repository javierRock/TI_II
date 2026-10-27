ALTER TABLE politicas_prestamo ADD CONSTRAINT modalidades_lista CHECK(JSON_TYPE(modalidades)='ARRAY' AND JSON_LENGTH(modalidades)>0);
ALTER TABLE reservas ADD CONSTRAINT confirmacion_documentada CHECK(estado NOT IN ('confirmada','atendida') OR (decidida_por IS NOT NULL AND decidida_en IS NOT NULL));
ALTER TABLE reservas ADD CONSTRAINT cancelacion_documentada CHECK(estado<>'cancelada' OR (cancelada_por IS NOT NULL AND cancelada_en IS NOT NULL AND motivo_cancelacion IS NOT NULL));
ALTER TABLE prestamos ADD CONSTRAINT plazo_aplicado CHECK(vencimiento<=TIMESTAMPADD(HOUR,duracion_max_horas,inicio));
ALTER TABLE prestamos ADD CONSTRAINT condiciones_no_soportadas CHECK(NOT garantia_exigida AND NOT renovacion_permitida AND max_renovaciones=0 AND tarifa_diaria=0);
