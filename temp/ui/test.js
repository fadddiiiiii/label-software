console.log("process.versions:", process.versions);
console.log("ELECTRON_RUN_AS_NODE:", process.env.ELECTRON_RUN_AS_NODE);
const electron = require("electron");
console.log("ELECTRON MODULE KEYS:", Object.keys(electron));
