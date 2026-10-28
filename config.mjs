export const config = {
  business: { name: 'HANZELMOTO s.r.o.', address: 'Dunajské nábrežie 1179/39, 945 05 Komárno', phone: '+421908797600', email: 'hanzelmoto@gmail.com' },
  timezone: 'Europe/Bratislava',
  // Proposed workshop capacity, NOT verified opening hours. Owner must approve before launch.
  schedule: { start: 9, end: 17, weekdays: [1,2,3,4,5], leadHours: 24, horizonDays: 90, step: 30 },
  services: [
    { id:'tyres', name:'Moto pneuservis', duration:60, description:'Výmena pneumatík, vyváženie a kontrola kolies.', icon:'◎' },
    { id:'annual', name:'Pravidelný servis', duration:120, description:'Olej, filtre a kontrola podľa potrieb vašej motorky.', icon:'↗' },
    { id:'check', name:'Kontrola pred sezónou', duration:60, description:'Brzdy, reťaz, kvapaliny a príprava na ďalšie kilometre.', icon:'✳' },
    { id:'diagnostic', name:'Diagnostika a oprava', duration:90, description:'Popíšte problém. Rozsah opravy dohodneme po kontrole.', icon:'⌁' }
  ],
  consentVersion:'annual-email-sk-v1',
  consentText:'Chcem dostávať e-mailové pripomienky ročnej údržby od HANZELMOTO. Súhlas je dobrovoľný a môžem ho kedykoľvek odvolať.',
};
