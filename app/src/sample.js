// A small fictional job hunt, offered to new users from the empty map.
// Dates are relative to today so the sample always looks current.
const day = n => { const d = new Date(Date.now() + n * 864e5); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const at = (n, hm) => day(n) + 'T' + hm;

const TEMPLATE = [
  ['companies', 'c1', { name: 'Northwind Analytics (sample)', industry: 'Data / SaaS', location: 'Chicago, IL', interest: '5', notes: 'Sample record. Use "Clear sample data" to remove.' }],
  ['companies', 'c2', { name: 'Halcyon Health (sample)', industry: 'Healthcare', location: 'Remote', interest: '4' }],
  ['companies', 'c3', { name: 'Brightline Robotics (sample)', industry: 'Hardware', location: 'Austin, TX', interest: '3' }],
  ['roles', 'r1', { title: 'Data Analyst II', companyId: '@c1', salary: '$95k–115k', workplace: 'Hybrid', posted: day(-42) }],
  ['roles', 'r2', { title: 'Product Analyst', companyId: '@c2', salary: '$105k–125k', workplace: 'Remote', posted: day(-34) }],
  ['roles', 'r3', { title: 'Operations Analyst', companyId: '@c3', workplace: 'On-site', posted: day(-50) }],
  ['roles', 'r4', { title: 'Analytics Engineer', companyId: '@c1', workplace: 'Hybrid' }],
  ['documents', 'd1', { name: 'Resume v2 (general)', kind: 'Resume' }],
  ['documents', 'd2', { name: 'Resume v3 (analytics)', kind: 'Resume' }],
  ['documents', 'd3', { name: 'Cover letter: healthcare', kind: 'Cover letter' }],
  ['people', 'p1', { name: 'Jordan Lee (sample)', kind: 'Recruiter', companyId: '@c1' }],
  ['people', 'p2', { name: 'Sam Rivera (sample)', kind: 'Hiring manager', companyId: '@c2' }],
  ['people', 'p3', { name: 'Priya Shah (sample)', kind: 'Referral', companyId: '@c1', notes: 'Former teammate; submitted an internal referral.' }],
  ['people', 'p4', { name: 'Alex Chen (sample)', kind: 'Interviewer', companyId: '@c1' }],
  ['applications', 'a1', { roleId: '@r1', status: 'interviewing', applied: day(-36), statusAt: day(-15), source: 'Recruiter', resumeId: '@d2', personIds: ['@p1'] }],
  ['applications', 'a2', { roleId: '@r2', status: 'screen', applied: day(-29), statusAt: day(-8), source: 'Company site', resumeId: '@d2', letterId: '@d3', personIds: ['@p2'] }],
  ['applications', 'a3', { roleId: '@r3', status: 'rejected', applied: day(-47), statusAt: day(-25), source: 'LinkedIn', resumeId: '@d1' }],
  ['applications', 'a4', { roleId: '@r4', status: 'applied', applied: day(-20), statusAt: day(-20), source: 'Referral', resumeId: '@d1', personIds: ['@p3'] }],
  ['interviews', 'i1', { applicationId: '@a1', round: 'Recruiter screen', date: at(-14, '10:00'), outcome: 'Passed', personIds: ['@p1', '@p4'] }],
  ['interviews', 'i2', { applicationId: '@a1', round: 'Technical', date: at(6, '14:00'), outcome: 'Pending' }],
  ['events', 'e1', { title: 'Rejection email received', kind: 'Rejection', date: day(-25), refs: ['applications/@a3'] }],
  ['events', 'e2', { title: 'Cold email sent to hiring manager', kind: 'Outreach sent', date: day(-28), refs: ['people/@p2', 'documents/@d3'] }],
];

export function sampleRows(newId) {
  const ids = new Map(TEMPLATE.map(([, k]) => [k, newId()]));
  const sub = v => typeof v === 'string' ? v.replace(/@(\w+)/, (_, k) => ids.get(k) || k)
    : Array.isArray(v) ? v.map(sub) : v;
  return TEMPLATE.map(([col, k, data]) => ({
    id: ids.get(k), col,
    data: { ...Object.fromEntries(Object.entries(data).map(([f, v]) => [f, sub(v)])), sample: true },
  }));
}
