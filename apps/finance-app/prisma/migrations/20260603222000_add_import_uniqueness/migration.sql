-- CreateIndex
CREATE UNIQUE INDEX "StoragePlace_ownerId_name_key" ON "StoragePlace"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Debt_ownerId_partyName_basis_key" ON "Debt"("ownerId", "partyName", "basis");
