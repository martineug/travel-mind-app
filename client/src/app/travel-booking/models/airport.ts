export interface AirportSuggestion {
  iataCode: string;
  name: string;
  cityName: string | null;
  countryName: string | null;
}

export interface AirportSuggestResponse {
  suggestions: AirportSuggestion[];
}
