
---

## 🧩 Tasks Overview

### ✅ Task A: Clean & Normalize Orders

**File:** `main.js`

- Load raw `orders.json` and `zones.csv`
- Normalize:
  - `city` and `zoneHint` via canonical mapping
  - `orderId`: uppercase, trimmed, formatted as `XXX-YYY`
  - `paymentType`: convert to `COD` or `Prepaid`
  - `productType`: lowercase
  - `weight`: convert to number
  - `deadline`: parse from `YYYY-MM-DD HH:MM` or `YYYY/MM/DD HH:MM`
- Merge duplicate orders (same normalized `orderId`)
  - Prefer non-empty fields
  - Keep earliest deadline
  - If address is different but similar, merge with a warning
- Output to: `clean_orders.json`

---

### ✅ Task B: Plan Courier Assignments

**File:** `main.js`

- Load `clean_orders.json` and `couriers.json`
- Assign each order to one courier based on:
  - Covers the `city` or `zoneHint`
  - `acceptsCOD` matches
  - `productType` not in `exclusions`
  - Has enough `dailyCapacity` (by total weight)
- Tie-breakers (in order):
  1. Lower priority
  2. Tighter deadline
  3. Lowest current assigned weight
  4. Lexicographical `courierId`
- Output to: `plan.json`

---

### ✅ Task C: Reconcile Plan vs. Delivery Log

**File:** `main.js`

- Load `clean_orders.json`, `plan.json`, `couriers.json`, and `log.csv`
- Output `reconciliation.json` containing:

  | Category           | Description |
  |--------------------|-------------|
  | `missing`          | Orders in `plan.json` but not in `log.csv` |
  | `unexpected`       | Orders in `log.csv` not in `clean_orders.json` |
  | `duplicate`        | Orders scanned more than once |
  | `late`             | Delivered after `deadline` |
  | `misassigned`      | Delivered by wrong courier |
  | `overloadedCouriers` | Couriers with actual total weight > capacity |

---

## 📦 How to Run

### 1. Install Node.js
Make sure Node.js is installed:  
[https://nodejs.org/](https://nodejs.org/)

---

### 2. Run Main Script

```bash
# Run all tasks (Clean, Plan, Reconcile)
node main.js
