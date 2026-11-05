import { fromLocalInput } from "../src/time.js";

export const MEL = "Australia/Melbourne";
export const local = (s, tz = MEL) => fromLocalInput(s, tz);

export const profile = (over = {}) => ({
  name: "Test Org", timeZone: MEL, privacyAct: false, turnoverOver3m: false, sociResponsible: false,
  governmentBody: false, apraRegulated: false, victorianPublicSector: false, ...over,
});

export const incident = (over = {}) => ({
  id: "inc-1", title: "Test", awareAt: "2026-11-02T00:00:00.000Z", personalInfo: false, sociImpact: "none",
  apraMaterialInfosec: false, apraMaterialOpRisk: false, vpsInfosecIncident: false, notifications: {}, ...over,
});
