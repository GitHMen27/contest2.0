-- ============================================================================
-- WB Logistics Tracker - Database Schema & Initial Data Dump
-- Областной конкурс студенческих дизайн-проектов (Номинация: Web-дизайн)
-- СУБД: PostgreSQL / MySQL (ANSI SQL compatible)
-- ============================================================================

-- 1. Удаление старых таблиц (если существуют)
DROP TABLE IF EXISTS ai_analytics CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS hubs CASCADE;

-- 2. Таблица логистических хабов / складов (Hubs)
CREATE TABLE hubs (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    latitude DECIMAL(9, 6) NOT NULL,
    longitude DECIMAL(9, 6) NOT NULL,
    status VARCHAR(50) DEFAULT 'optimal', -- 'optimal', 'warning', 'critical'
    capacity_percentage INT DEFAULT 50,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Таблица активных поставок / грузов (Shipments)
CREATE TABLE shipments (
    id VARCHAR(32) PRIMARY KEY,
    origin_hub_id VARCHAR(32) REFERENCES hubs(id) ON DELETE CASCADE,
    destination_hub_id VARCHAR(32) REFERENCES hubs(id) ON DELETE CASCADE,
    cargo_type VARCHAR(100) NOT NULL,
    weight_tons DECIMAL(6, 2) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'in_transit', 'delayed', 'delivered'
    eta TIMESTAMP NOT NULL,
    driver_name VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Таблица результатов ИИ-аналитики и рисков (AI Analytics)
CREATE TABLE ai_analytics (
    id SERIAL PRIMARY KEY,
    shipment_id VARCHAR(32) REFERENCES shipments(id) ON DELETE CASCADE,
    delay_risk_percentage INT NOT NULL,
    fuel_consumption_liters DECIMAL(7, 2) NOT NULL,
    co2_emissions_kg DECIMAL(7, 2) NOT NULL,
    risk_factor VARCHAR(255),
    recommendation TEXT,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- НАПОЛНЕНИЕ ДЕМОНСТРАЦИОННЫМИ ДАННЫМИ
-- ============================================================================

-- Вставка хабов (Ключевые распределительные центры)
INSERT INTO hubs (id, name, city, latitude, longitude, status, capacity_percentage) VALUES
('hub-1', 'РЦ Коледино', 'Подольск', 55.3861, 37.5811, 'optimal', 82),
('hub-2', 'РЦ Электросталь', 'Электросталь', 55.7956, 38.4411, 'warning', 91),
('hub-3', 'РЦ Казань', 'Казань', 55.7887, 49.1221, 'optimal', 64),
('hub-4', 'РЦ Екатеринбург', 'Екатеринбург', 56.8389, 60.6057, 'optimal', 73),
('hub-5', 'РЦ Краснодар', 'Краснодар', 45.0355, 38.9753, 'critical', 96);

-- Вставка активных поставок
INSERT INTO shipments (id, origin_hub_id, destination_hub_id, cargo_type, weight_tons, status, eta, driver_name) VALUES
('WB-8921', 'hub-1', 'hub-3', 'Электроника и бытовая техника', 14.50, 'in_transit', '2026-10-15 14:30:00', 'Алексей Смирнов'),
('WB-4410', 'hub-2', 'hub-4', 'Одежда и текстиль', 8.20, 'delayed', '2026-10-16 09:00:00', 'Игорь Васильев'),
('WB-1092', 'hub-3', 'hub-5', 'Продукты питания (сухие)', 18.00, 'in_transit', '2026-10-15 22:00:00', 'Дмитрий Кузнецов');

-- Вставка ИИ-прогнозов по рискам и выбросам CO2
INSERT INTO ai_analytics (shipment_id, delay_risk_percentage, fuel_consumption_liters, co2_emissions_kg, risk_factor, recommendation) VALUES
('WB-8921', 12, 245.50, 643.20, 'Низкий уровень пробок на трассе М-12', 'Маршрут оптимален, коррекция не требуется.'),
('WB-4410', 78, 410.00, 1074.20, 'Перегрузка участка трассы около Нижнего Новгорода + погодный фронт', 'Рекомендуется объезд через Иваново (+40 км, но сбережет 2.5 часа).'),
('WB-1092', 35, 310.80, 814.30, 'Очередь на разгрузку в РЦ Краснодар', 'Перенаправить на буферную парковку за 15 км до терминала.');