import type { Metadata } from 'next';
import { WarehouseSite } from '@/components/warehouse/WarehouseSite';

export const metadata: Metadata = {
  title: 'РЦ Шушары — цифровой двойник склада',
  description:
    'Интерактивная карта распределительного центра Шушары: зоны, сотрудники, техника, поиск и навигация по складу.',
};

export default function ShusharyPage() {
  return <WarehouseSite />;
}
