# FeelFair - City of Mati Pedicab Fare & Route Calculator

A fast, mobile-friendly GIS web application built for calculating official motorized pedicab and tricycle fares in the City of Mati, Davao Oriental, based on official municipal tariff schedules, distance routing, and prevailing fuel price tiers.

---

## 📌 How to Change the Default Fuel Tier

When fuel prices change in Mati, update the default tier in your code so the app opens with the new prevailing tariff automatically.

### 1. In `app.js` (The Main Calculation Engine)

Open [`app.js`](app.js) and look at **Lines 26–30**:

```javascript
const DEFAULT_CONFIG = {
  currency: '₱',
  selectedTier: 1,        // 👈 CHANGE THIS NUMBER (1, 2, 3, 4, 5, 6, 7, or 8)
  avgSpeedKmh: 28
};
```

*Example:* If gas prices rise to ₱65.00/L (which falls under **Tier 2**), simply change `selectedTier: 1` to `selectedTier: 2`.

---

### 2. In `index.html` (The Initial HTML Badge)

Open [`index.html`](index.html) and look at **Line 180**:

```html
<button type="button" id="trip-badge" class="trip-mode-badge" title="Click to change Fuel Tier" aria-label="Change Fuel Tariff Tier">
  <span id="trip-badge-text">Tier 1</span>  <!-- 👈 Change to e.g. Tier 2 -->
  <i class="ph-bold ph-caret-down"></i>
</button>
```

This ensures the badge displays the new tier immediately while the page is loading.

---

## ⛽ City of Mati Official Fuel Tariff Matrix

If the City Council or CTFO updates the fuel price ranges or base fares, edit the `FUEL_TIERS` table in [`app.js`](app.js) (**Lines 10–19**):

```javascript
const FUEL_TIERS = [
  { id: 1, name: 'Tier 1', fuelMin: 50.00, fuelMax: 59.99, baseFare: 15.00, baseDistance: 3.0, ratePerKm: 2.00 },
  { id: 2, name: 'Tier 2', fuelMin: 60.00, fuelMax: 79.99, baseFare: 20.00, baseDistance: 3.0, ratePerKm: 3.00 },
  { id: 3, name: 'Tier 3', fuelMin: 80.00, fuelMax: 89.99, baseFare: 20.00, baseDistance: 3.0, ratePerKm: 4.00 },
  { id: 4, name: 'Tier 4', fuelMin: 90.00, fuelMax: 99.99, baseFare: 20.00, baseDistance: 3.0, ratePerKm: 5.00 },
  { id: 5, name: 'Tier 5', fuelMin: 100.00, fuelMax: 124.99, baseFare: 20.00, baseDistance: 3.0, ratePerKm: 6.00 },
  { id: 6, name: 'Tier 6', fuelMin: 125.00, fuelMax: 149.99, baseFare: 20.00, baseDistance: 3.0, ratePerKm: 7.00 },
  { id: 7, name: 'Tier 7', fuelMin: 150.00, fuelMax: 174.99, baseFare: 25.00, baseDistance: 3.0, ratePerKm: 8.00 },
  { id: 8, name: 'Tier 8', fuelMin: 175.00, fuelMax: 200.00, baseFare: 30.00, baseDistance: 3.0, ratePerKm: 9.00 }
];
```

| Tier | Fuel Price Range (/L) | Base Fare (First 3.0 km) | Succeeding Rate (/km) |
| :--- | :--- | :--- | :--- |
| **Tier 1** | ₱50.00 – ₱59.99 | ₱15.00 | +₱2.00 / km |
| **Tier 2** | ₱60.00 – ₱79.99 | ₱20.00 | +₱3.00 / km |
| **Tier 3** | ₱80.00 – ₱89.99 | ₱20.00 | +₱4.00 / km |
| **Tier 4** | ₱90.00 – ₱99.99 | ₱20.00 | +₱5.00 / km |
| **Tier 5** | ₱100.00 – ₱124.99 | ₱20.00 | +₱6.00 / km |
| **Tier 6** | ₱125.00 – ₱149.99 | ₱20.00 | +₱7.00 / km |
| **Tier 7** | ₱150.00 – ₱174.99 | ₱25.00 | +₱8.00 / km |
| **Tier 8** | ₱175.00 – ₱200.00 | ₱30.00 | +₱9.00 / km |

---

## 🚀 How to Run Locally

Run the lightweight PowerShell server script:

```powershell
powershell -ExecutionPolicy Bypass -File "server.ps1"
```

Then open your browser to:
**`http://localhost:8080/`**

---

## 📁 Project Structure

* **`index.html`**: Main single-page application structure, interactive drawer, map container, and fare breakdown modals.
* **`app.js`**: Leaflet map controls, OSRM routing engine, municipal tariff calculation rules, address autocomplete, and GPS geolocation.
* **`style.css`**: Mobile-first responsive styling, glassmorphism card components, custom color palettes, and micro-animations.
* **`server.ps1`**: Local HTTP server script for development and testing.
"# FeelFare" 
