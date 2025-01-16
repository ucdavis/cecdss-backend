export interface TreatedCluster {
  cluster_no: string;
  treatmentid: string;
  year: number;
  landing_lat: number;
  landing_lng: number;
  landing_elevation: number;
  center_lat: number;
  center_lng: number;
  center_elevation: number;
  slope: number;
  area: number;
  mean_yarding: number;
  site_class: string;
  county_name: string;
  land_use: string;
  forest_type: string;
  haz_class: number;
  stem4to6_tonsacre: number;
  stem6to9_tonsacre: number;
  stem9plus_tonsacre: number;
  branch_tonsacre: number;
  foliage_tonsacre: number;
  wood_density: number;
}
