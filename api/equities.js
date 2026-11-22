// PAYD Equity Intelligence — SEC EDGAR adapter (read-only).
// Set SEC_USER_AGENT to an identifiable application and real contact email.
// SEC's fair-access policy requires an honest User-Agent and conservative request rates.
const HEADERS = () => ({
  'User-Agent': process.env.SEC_USER_AGENT || '',
  'Accept': 'application/json',
  'Accept-Encoding': 'gzip, deflate',
});
const cache = new Map();
async function cachedJson(url, ttlMs) {
  const now = Date.now(), hit = cache.get(url);
  if (hit && now - hit.time < ttlMs) return hit.data;
  const response = await fetch(url, { headers: HEADERS(), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('SEC request failed (' + response.status + ')');
  const data = await response.json();
  if (cache.size > 200) cache.clear();
  cache.set(url, { time: now, data });
  return data;
}
const metricTags = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet'],
  netIncome: ['NetIncomeLoss'],
  operatingCashFlow: ['NetCashProvidedByUsedInOperatingActivities'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment'],
  assets: ['Assets'],
  liabilities: ['Liabilities'],
  cash: ['CashAndCashEquivalentsAtCarryingValue'],
  longTermDebt: ['LongTermDebtCurrent','LongTermDebtNoncurrent','LongTermDebt'],
  dilutedEPS: ['EarningsPerShareDiluted']
};
function extractMetric(facts, names, unit) {
  for (const name of names) {
    const items = facts?.['us-gaap']?.[name]?.units?.[unit] || [];
    const valid = items.filter(x => x.form === '10-K' && /^20\d\d-\d\d-\d\d$/.test(x.end || '') && Number.isFinite(x.val) &&
      (x.fy || x.frame) && (!x.start || (new Date(x.end) - new Date(x.start)) / 86400000 > 300));
    // Prefer a reported fiscal year (not overlapping comparative duplicates).
    valid.sort((a,b) => (b.end || '').localeCompare(a.end || '') || (b.filed || '').localeCompare(a.filed || ''));
    if (valid.length) {
      const onePerYear = [...new Map(valid.map(x => [x.end,x])).values()].slice(0,5);
      return { tag: name, value: onePerYear[0].val, end: onePerYear[0].end,
        filed: onePerYear[0].filed, history: onePerYear.map(x=>({end:x.end,value:x.val})) };
    }
  }
  return null;
}
function metrics(facts) {
  const out={};
  for (const [key,names] of Object.entries(metricTags)) out[key]=extractMetric(facts,names,key==='dilutedEPS'?'USD/shares':'USD');
  const ocf=out.operatingCashFlow, capex=out.capex;
  // Never mix financial values from different reporting periods.
  out.freeCashFlow=ocf && capex && ocf.end===capex.end
    ? {value:ocf.value-capex.value,end:ocf.end,filed:ocf.filed,method:'Operating cash flow minus capex'} : null;
  return out;
}
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=3600');
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  const ticker = String(req.query.ticker || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return res.status(400).json({error:'Use a valid US stock ticker'});
  if (!process.env.SEC_USER_AGENT || !/\S+@\S+/.test(process.env.SEC_USER_AGENT))
    return res.status(503).json({error:'SEC connector not configured',detail:'Set SEC_USER_AGENT with a real contact email in server environment'});
  try {
    const directory = await cachedJson('https://www.sec.gov/files/company_tickers.json',24*3600000);
    const match = Object.values(directory).find(x=>String(x.ticker).toUpperCase()===ticker);
    if (!match) return res.status(404).json({error:'Ticker not found in SEC directory'});
    const cik = String(match.cik_str).padStart(10,'0');
    const facts = await cachedJson('https://data.sec.gov/api/xbrl/companyfacts/CIK'+cik+'.json',6*3600000);
    return res.status(200).json({ticker,company:match.title,cik,source:'SEC EDGAR Company Facts',
      sourceUrl:'https://www.sec.gov/edgar/browse/?CIK='+cik,asOf:new Date().toISOString(),
      metrics:metrics(facts.facts),notes:['Annual US-GAAP facts, 10-K filings only','Missing values are not replaced with zero','No live quote or fair-value claim']});
  } catch(e) {
    return res.status(502).json({error:'SEC data unavailable',detail:String(e.message).slice(0,160)});
  }
};
