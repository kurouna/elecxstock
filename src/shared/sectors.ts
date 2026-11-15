// 業種の分類（ポートフォリオ。design-portfolio.md §8）: 33 業種から TOPIX-17 業種への対応と、景気敏感・ディフェンシブの既定の割り当て。
// 17 業種は東証の定義で 33 業種をまとめたものなので、JPX の一覧の 33 業種から決まる（取り込みの列を増やさない）。

/** 17 業種（東証の TOPIX-17 シリーズの区分） */
export const SECTOR17 = [
  '食品',
  'エネルギー資源',
  '建設・資材',
  '素材・化学',
  '医薬品',
  '自動車・輸送機',
  '鉄鋼・非鉄',
  '機械',
  '電機・精密',
  '情報通信・サービスその他',
  '電力・ガス',
  '運輸・物流',
  '商社・卸売',
  '小売',
  '銀行',
  '金融（除く銀行）',
  '不動産',
] as const
export type Sector17 = (typeof SECTOR17)[number]

export const SECTOR17_EN: Record<Sector17, string> = {
  食品: 'Foods',
  エネルギー資源: 'Energy Resources',
  '建設・資材': 'Construction & Materials',
  '素材・化学': 'Raw Materials & Chemicals',
  医薬品: 'Pharmaceutical',
  '自動車・輸送機': 'Automobiles & Transportation Equipment',
  '鉄鋼・非鉄': 'Steel & Nonferrous Metals',
  機械: 'Machinery',
  '電機・精密': 'Electric Appliances & Precision Instruments',
  '情報通信・サービスその他': 'IT & Services, Others',
  '電力・ガス': 'Electric Power & Gas',
  '運輸・物流': 'Transportation & Logistics',
  '商社・卸売': 'Commercial & Wholesale Trade',
  小売: 'Retail Trade',
  銀行: 'Banks',
  '金融（除く銀行）': 'Financials (ex Banks)',
  不動産: 'Real Estate',
}

const MAP: Record<string, Sector17> = {
  '水産・農林業': '食品',
  食料品: '食品',
  鉱業: 'エネルギー資源',
  '石油・石炭製品': 'エネルギー資源',
  建設業: '建設・資材',
  金属製品: '建設・資材',
  'ガラス・土石製品': '建設・資材',
  繊維製品: '素材・化学',
  'パルプ・紙': '素材・化学',
  化学: '素材・化学',
  医薬品: '医薬品',
  ゴム製品: '自動車・輸送機',
  輸送用機器: '自動車・輸送機',
  鉄鋼: '鉄鋼・非鉄',
  非鉄金属: '鉄鋼・非鉄',
  機械: '機械',
  電気機器: '電機・精密',
  精密機器: '電機・精密',
  その他製品: '情報通信・サービスその他',
  '情報・通信業': '情報通信・サービスその他',
  サービス業: '情報通信・サービスその他',
  '電気・ガス業': '電力・ガス',
  陸運業: '運輸・物流',
  海運業: '運輸・物流',
  空運業: '運輸・物流',
  '倉庫・運輸関連業': '運輸・物流',
  卸売業: '商社・卸売',
  小売業: '小売',
  銀行業: '銀行',
  '証券、商品先物取引業': '金融（除く銀行）',
  保険業: '金融（除く銀行）',
  その他金融業: '金融（除く銀行）',
  不動産業: '不動産',
}

/** 33 業種の名前（日本語）から 17 業種。分からなければ null（REIT・ETF・業種の無い銘柄） */
export function sector17Of(sector33: string): Sector17 | null {
  return MAP[sector33.trim()] ?? null
}

export type Cyclicality = 'cyclical' | 'defensive'
/** 景気敏感・ディフェンシブの既定の割り当て（17 業種ごと） */
export const CYCLICALITY: Record<Sector17, Cyclicality> = {
  食品: 'defensive',
  エネルギー資源: 'cyclical',
  '建設・資材': 'cyclical',
  '素材・化学': 'cyclical',
  医薬品: 'defensive',
  '自動車・輸送機': 'cyclical',
  '鉄鋼・非鉄': 'cyclical',
  機械: 'cyclical',
  '電機・精密': 'cyclical',
  '情報通信・サービスその他': 'defensive',
  '電力・ガス': 'defensive',
  '運輸・物流': 'cyclical',
  '商社・卸売': 'cyclical',
  小売: 'defensive',
  銀行: 'cyclical',
  '金融（除く銀行）': 'cyclical',
  不動産: 'cyclical',
}
