export interface RankingArrayItem {
  rank: number
  bestRankId: number
}

export interface Ranking {
  [key: number]: RankingArrayItem
}

export interface Apartment {
  humanized_rent: string
  id: number
  large_plan_image: string
  plan_type: string
  rank: number
  queued_applications_count: number
  area: number
  floor: string
  apartment_type_id: number
  building: {
    id: number
    street_address: string

  }

}
