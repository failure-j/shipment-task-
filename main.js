const fs = require('fs');

const orders = require('./orders.json')

fs.readFile('zones.csv', 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }

  const lines = data.trim().split('\n');
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });

  rows.forEach(zone=>{
    zone.raw=zone.raw.replaceAll('"','')
    zone.canonical=zone.canonical.replaceAll('"','')


  })



  
  
 orders.forEach(order=>  {

   order.orderId= order.orderId.trim().slice(0,3).toUpperCase()+ '-'+ order.orderId.trim().replace(/\./g,'').slice(-3)
    order.paymentType= order.paymentType.toLowerCase().includes('cod')? "COD": "Prepaid";
    order.productType= order.productType.toLowerCase()
    order.weight= typeof(order.weight)==='number'? order.weight : Number(order.weight.replace(/[^\d.]/g, ''))
    order.deadline= new Date( order.deadline.replaceAll('/','-'))
    
    rows.map(correction=>{  
        
        
        if( order.city.includes(correction.raw))
            {
     order.city= order.city.replace(correction.raw,correction.canonical)
 }

 if(order.zoneHint.includes(correction.raw)){
    order.zoneHint= order.zoneHint.replace(correction.raw,correction.canonical)
 }
       else {

             order.city
             order.zoneHint

       }
       
    
    } )

  
 }

   
 )


 function normalizeAddress(addr) {
    return addr.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  }
  
  function areAddressesSimilar(a, b) {
    return normalizeAddress(a) === normalizeAddress(b);
  }
  
  function mergeOrders(a, b) {
    const merged = { ...a };
    merged.warnings = merged.warnings || [];
  
    for (const key in b) {
      if (!merged[key]) {
        merged[key] = b[key];
      } else if (key === "deadline") {
        merged.deadline = (new Date(b.deadline) < new Date(merged.deadline)) ? b.deadline : merged.deadline;
      } else if (key === "address") {
        if (!areAddressesSimilar(a.address, b.address)) {
          merged.warnings.push(`Address conflict: "${a.address}" vs "${b.address}"`);
          merged.address = (new Date(b.deadline) < new Date(merged.deadline)) ? b.address : merged.address;
        }
      }
    }
  
    return merged;
  }
  

  const grouped = {};

orders.forEach(order => {
  const id = order.orderId;
  if (!grouped[id]) grouped[id] = [];
  grouped[id].push(order);
});

// Merge each group
const mergedOrders = Object.values(grouped).map(group => {
  return group.reduce(mergeOrders);
});

fs.writeFileSync('clean_orders.json', JSON.stringify(mergedOrders, null, 2));
console.log('✅ clean_orders.json created with', mergedOrders.length, 'orders');

 console.log(orders)

});






// Load cleaned orders and couriers
const cleanedOrders = JSON.parse(fs.readFileSync('clean_orders.json', 'utf8'));
const couriers = JSON.parse(fs.readFileSync('couriers.json', 'utf8'));

// Initialize load tracking for each courier
const courierLoadMap = {};
couriers.forEach(courier => {
  courierLoadMap[courier.courierId] = {
    load: 0,
    assigned: []
  };
});

// Sort orders by deadline (earlier first)
cleanedOrders.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

const assignments = [];

cleanedOrders.forEach(order => {
  const eligibleCouriers = couriers.filter(courier => {
    const coversZone =
      courier.zonesCovered.includes(order.city) ||
      courier.zonesCovered.includes(order.zoneHint);

    const acceptsCOD = order.paymentType === 'COD' ? courier.acceptsCOD : true;
    const productAllowed = !courier.exclusions.includes(order.productType);
    const hasCapacity =
      courierLoadMap[courier.courierId].load + order.weight <= courier.dailyCapacity;

    return coversZone && acceptsCOD && productAllowed && hasCapacity;
  });

  // Sort by tie-breakers
  eligibleCouriers.sort((a, b) => {
    // 1. Lower priority
    if (a.priority !== b.priority) return a.priority - b.priority;

    // 2. Earliest deadline
    const da = new Date(order.deadline);
    const db = new Date(order.deadline); // same as above
    if (da - db !== 0) return da - db;

    // 3. Lowest current assigned load
    const loadA = courierLoadMap[a.courierId].load;
    const loadB = courierLoadMap[b.courierId].load;
    if (loadA !== loadB) return loadA - loadB;

    // 4. Lexicographical courierId
    return a.courierId.localeCompare(b.courierId);
  });

  const assignedCourier = eligibleCouriers[0];

  if (assignedCourier) {
    courierLoadMap[assignedCourier.courierId].load += order.weight;
    courierLoadMap[assignedCourier.courierId].assigned.push(order.orderId);
    assignments.push({
      orderId: order.orderId,
      assignedCourier: assignedCourier.courierId
    });
  } else {
    assignments.push({
      orderId: order.orderId,
      assignedCourier: null,
      warning: 'No eligible courier found'
    });
  }
});

// Write plan.json
fs.writeFileSync('plan.json', JSON.stringify(assignments, null, 2));
console.log('✅ plan.json created with courier assignments');




const path = require('path');

// Load files

const plan = JSON.parse(fs.readFileSync('plan.json', 'utf8'));
const logCSV = fs.readFileSync('log.csv', 'utf8').trim().split('\n');

// Parse log.csv
const headers = logCSV[0].split(',');
const logs = logCSV.slice(1).map(line => {
  const values = line.split(',');
  return Object.fromEntries(headers.map((h, i) => [h.trim(), values[i].trim()]));
});

// Create lookup maps
const orderMap = Object.fromEntries(cleanedOrders.map(o => [o.orderId, o]));
const planMap = Object.fromEntries(plan.map(p => [p.orderId, p.assignedCourier]));

// Build reconciliation structure
const reconciliation = {
  missing: [],
  unexpected: [],
  duplicate: [],
  late: [],
  misassigned: [],
  overloadedCouriers: []
};

// Track counts and loads
const seenOrders = {};
const courierLoads = {};
const courierCapacities = {}; // from clean_orders.json and plan

// Main log processing
logs.forEach(log => {
  const { orderId, courierId, timestamp } = log;

  // Count appearances
  seenOrders[orderId] = seenOrders[orderId] ? seenOrders[orderId] + 1 : 1;

  // Track courier loads
  const order = orderMap[orderId];
  if (order) {
    courierLoads[courierId] = courierLoads[courierId] || 0;
    courierLoads[courierId] += parseFloat(order.weight);
  }

  // Check for unexpected
  if (!orderMap[orderId]) {
    reconciliation.unexpected.push(orderId);
    return;
  }

  // Check for lateness
  const deliveryTime = new Date(timestamp);
  const deadline = new Date(order.deadline);
  if (deliveryTime > deadline) {
    reconciliation.late.push(orderId);
  }

  // Check for misassignment
  const plannedCourier = planMap[orderId];
  if (plannedCourier && courierId !== plannedCourier) {
    reconciliation.misassigned.push(orderId);
  }
});

// Check for duplicates
for (const [orderId, count] of Object.entries(seenOrders)) {
  if (count > 1) {
    reconciliation.duplicate.push(orderId);
  }
}

// Check for missing orders
for (const planned of plan) {
  if (!seenOrders[planned.orderId]) {
    reconciliation.missing.push(planned.orderId);
  }
}

// Load courier capacity from courier.json to check overload

couriers.forEach(courier => {
  const courierId = courier.courierId;
  const actualLoad = courierLoads[courierId] || 0;
  if (actualLoad > courier.dailyCapacity) {
    reconciliation.overloadedCouriers.push({
      courierId,
      load: actualLoad,
      capacity: courier.dailyCapacity
    });
  }
});

// Write reconciliation output
fs.writeFileSync('reconciliation.json', JSON.stringify(reconciliation, null, 2));
console.log('✅ reconciliation.json created');
