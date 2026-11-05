import type { Hub } from '@/types/logistics';

export const HUBS: Hub[] = [
  {
    id: 'koledino',
    name: 'Коледино',
    city: 'Подольск',
    coords: [55.3858, 37.5856],
    status: 'warning',
    load: 82,
  },
  {
    id: 'elektrostal',
    name: 'Электросталь',
    city: 'Московская область',
    coords: [55.7725, 38.4526],
    status: 'warning',
    load: 91,
  },
  {
    id: 'shushary',
    name: 'Шушары',
    city: 'Санкт-Петербург',
    coords: [59.7891, 30.3831],
    status: 'optimal',
    load: 58,
  },
  {
    id: 'kazan',
    name: 'Зеленодольск',
    city: 'Казань',
    coords: [55.8505, 48.5204],
    status: 'optimal',
    load: 64,
  },
  {
    id: 'krasnodar',
    name: 'Краснодар',
    city: 'Краснодар',
    coords: [45.0355, 38.9753],
    status: 'critical',
    load: 96,
  },
  {
    id: 'ekaterinburg',
    name: 'Екатеринбург',
    city: 'Екатеринбург',
    coords: [56.8389, 60.6057],
    status: 'optimal',
    load: 73,
  },
];

export function getHub(id: string): Hub | undefined {
  return HUBS.find((hub) => hub.id === id);
}
