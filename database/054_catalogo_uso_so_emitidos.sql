-- Sugestões de medicamento/exame: só o que foi EMITIDO (impresso ou consulta finalizada).
-- A versão anterior registrava também o salvamento automático, então texto digitado pela
-- metade ("AA", "CA") entrou na lista. Limpa o índice de uso dos atendimentos ainda não
-- encerrados; eles voltam a contar quando a receita/pedido for impresso ou a consulta finalizada.
DELETE FROM catalogo_uso
WHERE prontuario_id IN (
  SELECT p.id
  FROM prontuarios p
  LEFT JOIN agendamentos a ON a.id = p.agendamento_id
  WHERE (p.template_snapshot_json IS NULL OR trim(p.template_snapshot_json) = '')
    AND COALESCE(a.status, '') <> 'finalizado'
);
