import type { Metadata } from 'next';
import { SimulatorPage } from '@/components/SimulatorPage';

export const metadata: Metadata = {
  title: 'Симулятор сценариев — WB Logistics',
  description:
    'Демонстрационный симулятор логистической сети: перегрузка, нехватка сотрудников, авария техники, задержки рейсов и перераспределение потока.',
};

export default function SimulatorRoute() {
  return <SimulatorPage />;
}
