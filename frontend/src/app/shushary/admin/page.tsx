import type { Metadata } from 'next';
import { WarehouseAdmin } from '@/components/warehouse/WarehouseAdmin';
import { RequireAdmin } from '@/components/RequireAdmin';

export const metadata: Metadata = {
  title: 'РЦ Шушары — админ-панель',
  description:
    'Административный режим цифрового двойника склада Шушары: сотрудники, зоны, техника и мониторинг.',
};

export default function ShusharyAdminPage() {
  return (
    <RequireAdmin>
      <WarehouseAdmin />
    </RequireAdmin>
  );
}
