export interface Hub {
  id: string;
  name: string;
  coords: [number, number];
}

export const HUBS: Hub[] = [
  { id: 'koledino', name: 'РЦ Коледино (Подольск)', coords: [55.3858, 37.5856] },
  { id: 'elektrostal', name: 'РЦ Электросталь', coords: [55.7725, 38.4526] },
  { id: 'shushary', name: 'РЦ Шушары (СПб)', coords: [59.7891, 30.3831] },
  { id: 'kazan', name: 'РЦ Зеленодольск (Казань)', coords: [55.8505, 48.5204] },
  { id: 'krasnodar', name: 'РЦ Краснодар', coords: [45.0355, 38.9753] },
  { id: 'ekaterinburg', name: 'РЦ Екатеринбург', coords: [56.8389, 60.6057] },
];