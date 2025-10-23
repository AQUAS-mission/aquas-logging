/**
 * datagen.ts
 * Generates mock sensor data and writes it to data.json
 */

import * as fs from "fs";

interface SensorReading {
    timestamp: number;
    ph: number;
    temperature: number;
    dissolved_oxygen: number;
    electrical_conductivity: number;
    turbidity_ntu: number;
}

// Utility to generate a random float between two values
function randomFloat(min: number, max: number, decimals = 2): number {
    const val = Math.random() * (max - min) + min;
    return parseFloat(val.toFixed(decimals));
}

// Generate a single reading
function generateReading(): SensorReading {
    return {
        timestamp: Math.floor(Date.now() / 1000), // current UNIX time
        ph: randomFloat(6.5, 8.5, 2),
        temperature: randomFloat(10, 35, 2),
        dissolved_oxygen: randomFloat(5, 14, 2),
        electrical_conductivity: randomFloat(50, 1500, 2),
        turbidity_ntu: randomFloat(0, 100, 2),
    };
}

// Generate a batch of readings
function generateData(count: number): SensorReading[] {
    const data: SensorReading[] = [];
    let currentTime = Math.floor(Date.now() / 1000);
    for (let i = 0; i < count; i++) {
        const reading = generateReading();
        reading.timestamp = currentTime + i * 60; // increment timestamp by 1 min
        data.push(reading);
    }
    return data;
}

// Write generated data to data.json
function writeDataToFile(data: SensorReading[], filename = "./mocks/sensor-data.json") {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2), "utf-8");
    console.log(`✅ Successfully wrote ${data.length} readings to ${filename}`);
}

// Example usage
const numReadings = 100; // You can change this
const readings = generateData(numReadings);
writeDataToFile(readings);

