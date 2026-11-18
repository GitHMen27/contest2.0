import type { Metadata } from 'next';
import { EconomicsPage } from '@/components/EconomicsPage';

export const metadata: Metadata = {
  title: 'Экономика сети — WB Logistics',
  description:
    'Демонстрационный расчёт стоимости рейсов, топлива, простоя, заказов и инцидентов по распределительным центрам.',
};

export default function EconomicsRoute() {
  return <EconomicsPage />;
}
