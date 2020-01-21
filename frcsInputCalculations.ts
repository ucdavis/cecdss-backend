import { Pixel } from './models/pixel';
import { TreatedCluster } from './models/treatedcluster';

export const sumNumberOfTrees = (pixel: Pixel) => {
  return (
    // pixel.sng_0 +
    // pixel.sng_2 +
    // pixel.sng_7 +
    // pixel.sng_15 +
    // pixel.sng_25 +
    // pixel.sng_35 +
    // pixel.sng_40 +
    pixel.tpa_0 + pixel.tpa_2 + pixel.tpa_7 + pixel.tpa_15 + pixel.tpa_25
    // pixel.tpa_35
    // pixel.tpa_40
  );
};

export const sumBiomass = (pixel: Pixel) => {
  return (
    pixel.bmfol_0 +
    pixel.bmfol_2 +
    pixel.bmfol_7 +
    pixel.bmfol_15 +
    pixel.bmfol_25 +
    // pixel.bmfol_35 +
    // pixel.bmfol_40 +
    pixel.bmcwn_0 +
    pixel.bmcwn_2 +
    pixel.bmcwn_7 +
    pixel.bmcwn_15 +
    pixel.bmcwn_25 +
    // pixel.bmcwn_35 +
    // pixel.bmcwn_40 +
    pixel.bmstm_0 +
    pixel.bmstm_2 +
    pixel.bmstm_7 +
    pixel.bmstm_15 +
    pixel.bmstm_25
    // + pixel.bmstm_35 +
    // pixel.bmstm_40
  );
};
const metersToAcresConstant = 0.00024711;

const pixelsToAcreConstant = 30 * 30 * metersToAcresConstant;

// these equations come from this sheet:
// https://ucdavis.app.box.com/file/566320916282

// chip trees removed
export const calcRemovalsCT = (pixel: Pixel | TreatedCluster) => {
  // live trees per acre + snags per acre
  return pixel.tpa_0 + pixel.tpa_2 + pixel.tpa_7;
  // TODO: add when we get dead biomass  + pixel.sng_0 + pixel.sng_2 + pixel.sng_7);
};

export const calcRemovalsSLT = (pixel: Pixel | TreatedCluster) => {
  return pixel.tpa_15;
  // + pixel.sng_15) * 1;
};

export const calcRemovalsLLT = (pixel: Pixel | TreatedCluster) => {
  return pixel.tpa_25;
  // + pixel.tpa_35
  // + pixel.tpa_40
  // + pixel.sng_25 + pixel.sng_35 + pixel.sng_40) * 1
};

export const calcTreeVolCT = (pixel: Pixel | TreatedCluster) => {
  return (
    pixel.bmfol_0 +
    pixel.bmfol_2 +
    pixel.bmfol_7 +
    pixel.bmcwn_0 +
    pixel.bmcwn_2 +
    pixel.bmcwn_7 +
    pixel.bmstm_0 +
    pixel.bmstm_2 +
    pixel.bmstm_7
    // TODO: add DBMCN and DBMSM
  );
};

export const calcTreeVolSLT = (pixel: Pixel | TreatedCluster) => {
  return (
    pixel.bmfol_15 + pixel.bmcwn_15 + pixel.bmstm_15
    // TODO: add DBMCN 15 and DBMSM 15
  );
};

export const calcTreeVolLLT = (pixel: Pixel | TreatedCluster) => {
  return (
    pixel.bmfol_25 +
    // pixel.bmfol_35 +
    // pixel.bmfol_40 +
    pixel.bmcwn_25 +
    // pixel.bmcwn_35 +
    // pixel.bmcwn_40 +
    pixel.bmstm_25
    // pixel.bmstm_35
    // pixel.bmstm_40
    // TODO: add DBMCN and DBMSM
  );
};

export const sumPixel = (pixelSummation: Pixel, p: Pixel) => {
  const pixelSum: Pixel = {
    ...pixelSummation,
    cluster_no: p.cluster_no,
    bmcwn_0: pixelSummation.bmcwn_0 + p.bmcwn_0,
    bmcwn_15: pixelSummation.bmcwn_15 + p.bmcwn_15,
    bmcwn_2: pixelSummation.bmcwn_2 + p.bmcwn_2,
    bmcwn_25: pixelSummation.bmcwn_25 + p.bmcwn_25,
    bmcwn_35: pixelSummation.bmcwn_35 + p.bmcwn_35,
    bmcwn_40: pixelSummation.bmcwn_40 + p.bmcwn_40,
    bmcwn_7: pixelSummation.bmcwn_7 + p.bmcwn_7,
    bmfol_0: pixelSummation.bmfol_0 + p.bmfol_0,
    bmfol_15: pixelSummation.bmfol_15 + p.bmfol_15,
    bmfol_2: pixelSummation.bmfol_2 + p.bmfol_2,
    bmfol_25: pixelSummation.bmfol_25 + p.bmfol_25,
    bmfol_35: pixelSummation.bmfol_35 + p.bmfol_35,
    bmfol_40: pixelSummation.bmfol_40 + p.bmfol_40,
    bmfol_7: pixelSummation.bmfol_7 + p.bmfol_7,
    bmstm_0: pixelSummation.bmstm_0 + p.bmstm_0,
    bmstm_15: pixelSummation.bmstm_15 + p.bmstm_15,
    bmstm_2: pixelSummation.bmstm_2 + p.bmstm_2,
    bmstm_25: pixelSummation.bmstm_25 + p.bmstm_25,
    bmstm_35: pixelSummation.bmstm_35 + p.bmstm_35,
    bmstm_40: pixelSummation.bmstm_40 + p.bmstm_40,
    bmstm_7: pixelSummation.bmstm_7 + p.bmstm_7,
    sng_0: pixelSummation.sng_0 + p.sng_0,
    sng_15: pixelSummation.sng_15 + p.sng_15,
    sng_2: pixelSummation.sng_2 + p.sng_2,
    sng_25: pixelSummation.sng_25 + p.sng_25,
    sng_35: pixelSummation.sng_35 + p.sng_35,
    sng_40: pixelSummation.sng_40 + p.sng_40,
    sng_7: pixelSummation.sng_7 + p.sng_7,
    // get # of trees per pixel
    tpa_0: pixelSummation.tpa_0 + p.tpa_0, // * pixelsToAcreConstant,
    tpa_15: pixelSummation.tpa_15 + p.tpa_15, // * pixelsToAcreConstant,
    tpa_2: pixelSummation.tpa_2 + p.tpa_2, // * pixelsToAcreConstant,
    tpa_25: pixelSummation.tpa_25 + p.tpa_25, // * pixelsToAcreConstant,
    tpa_35: pixelSummation.tpa_35 + p.tpa_35, // * pixelsToAcreConstant,
    tpa_40: pixelSummation.tpa_40 + p.tpa_40, // * pixelsToAcreConstant,
    tpa_7: pixelSummation.tpa_7 + p.tpa_7 // * pixelsToAcreConstant
  };
  return pixelSum;
};
