const VATSIM_DATA_URL = "https://data.vatsim.net/v3/vatsim-data.json";

// Fetches the public VATSIM live network snapshot used for airport-level coverage markers.
export async function fetchVatsimNetworkData({ signal } = {}) {
  const response = await fetch(VATSIM_DATA_URL, {
    signal,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`VATSIM data request failed with HTTP ${response.status}`);
  }

  return response.json();
}
