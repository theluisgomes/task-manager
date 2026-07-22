ALTER TABLE `contract_payments`
  ADD COLUMN `dueType` enum('fixed','relative') NOT NULL DEFAULT 'fixed',
  ADD COLUMN `baseEventType` enum('assinatura','entrega') NULL,
  ADD COLUMN `baseEventDate` timestamp NULL,
  ADD COLUMN `daysAfterBase` int NULL;
