/**
 * FRCS ML Training Data Generator - INTELLIGENT MODEL VERSION
 * 
 * This version saves BOTH successful and failed FRCS runs
 * to train an intelligent model that learns:
 * 1. Whether a scenario is valid (feasibility)
 * 2. If valid, what the costs are
 */

import { getFrcsOutputs } from '@ucdavis/frcs';
import { FrcsOutputs } from '@ucdavis/frcs/out/model';
import * as fs from 'fs';
import { Knex } from 'knex';
import { getFrcsInputs } from '../frcsInputCalculations';
import { TreatedCluster } from './models/treatedcluster';
import * as cliProgress from 'cli-progress';

// Create progress bar
const progressBar = new cliProgress.SingleBar({
  format: 'Progress |{bar}| {percentage}% | {value}/{total} | Valid: {valid} | Invalid: {invalid} | Rate: {rate}/sec',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
});


// Database configuration
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'firegnn',
    user: process.env.DB_USER || 'aunsh',
    password: process.env.DB_PASSWORD || '!@QW12qwaszx',
  },
  pool: { min: 2, max: 20 }
});

// Harvest systems
const HARVEST_SYSTEMS = [
  'Ground-Based Mech WT',
  'Ground-Based Manual WT',
  'Ground-Based Manual Log',
  'Ground-Based CTL',
  'Cable Manual WT/Log',
  'Cable Manual WT',
  'Cable Manual Log',
  'Cable CTL',
  'Helicopter Manual Log',
  'Helicopter CTL'
];

// Default FRCS parameters
const DEFAULT_PARAMS = {
  dieselFuelPrice: 2.24,
  moistureContent: 50,
  wageFaller: 42.19,
  wageOther: 22.07,
  laborBenefits: 38.4,
  ppiCurrent: 145.62,
  residueRecovFracWT: 80,
  residueRecovFracCTL: 50
};

interface CompleteTrainingRow {
  // Cluster identifiers
  cluster_no: string;
  treatmentid: string;
  harvestSystem: string;
  
  // Input features
  slope: number;
  center_elevation: number;
  mean_yarding: number;
  area: number;
  stem6to9_tonsacre: number;
  stem4to6_tonsacre: number;
  stem9plus_tonsacre: number;
  branch_tonsacre: number;
  foliage_tonsacre: number;
  wood_density: number;
  burn_probability: number;
  
  // NEW: Validity flag
  is_valid: number;  // 1 = valid, 0 = invalid
  
  // NEW: Error categorization
  error_type: string | null;
  
  // Output predictions (null if invalid)
  total_costPerAcre: number | null;
  total_costPerGT: number | null;
  total_yieldPerAcre: number | null;
  total_dieselPerAcre: number | null;
  total_gasolinePerAcre: number | null;
  residual_costPerAcre: number | null;
  residual_costPerGT: number | null;
  residual_yieldPerAcre: number | null;
  residual_dieselPerAcre: number | null;
  residual_gasolinePerAcre: number | null;
}

/**
 * Categorize FRCS error types
 */
function categorizeError(errorMessage: string): string {
  if (errorMessage.includes('Slope should not be greater than 40')) {
    return 'slope_too_steep_ground';
  }
  if (errorMessage.includes('Slope should not be greater than 60')) {
    return 'slope_too_steep_cable';
  }
  if (errorMessage.includes('DeliverDist should not be greater than 1300')) {
    return 'yarding_too_far';
  }
  if (errorMessage.includes('TreeVolCT should not be greater than 80')) {
    return 'tree_volume_invalid';
  }
  if (errorMessage.includes('TreeVolSLT should not be greater than 80')) {
    return 'tree_volume_invalid';
  }
  if (errorMessage.includes('insufficient biomass') || errorMessage.includes('RemovalsCT')) {
    return 'insufficient_biomass';
  }
  return 'other_validation_error';
}

/**
 * Format CSV row
 */
function formatCsvRow(row: CompleteTrainingRow): string {
  const values = [
    row.cluster_no,
    row.treatmentid,
    `"${row.harvestSystem.replace(/"/g, '""')}"`,
    row.slope,
    row.center_elevation,
    row.mean_yarding,
    row.area,
    row.stem6to9_tonsacre,
    row.stem4to6_tonsacre,
    row.stem9plus_tonsacre,
    row.branch_tonsacre,
    row.foliage_tonsacre,
    row.wood_density,
    row.burn_probability,
    row.is_valid,
    row.error_type ? `"${row.error_type}"` : '',
    row.total_costPerAcre ?? '',
    row.total_costPerGT ?? '',
    row.total_yieldPerAcre ?? '',
    row.total_dieselPerAcre ?? '',
    row.total_gasolinePerAcre ?? '',
    row.residual_costPerAcre ?? '',
    row.residual_costPerGT ?? '',
    row.residual_yieldPerAcre ?? '',
    row.residual_dieselPerAcre ?? '',
    row.residual_gasolinePerAcre ?? ''
  ];
  
  return values.join(',') + '\n';
}

/**
 * Process cluster + treatment + system combination
 * NOW SAVES BOTH SUCCESSES AND FAILURES
 */
function processClusterTreatmentSystem(
  cluster: TreatedCluster,
  system: string,
  allRows: CompleteTrainingRow[]
): void {
  
  try {
    // Get FRCS inputs
    const frcsInputs = getFrcsInputs(
      cluster,
      system,
      DEFAULT_PARAMS.dieselFuelPrice,
      DEFAULT_PARAMS.moistureContent,
      DEFAULT_PARAMS.wageFaller,
      DEFAULT_PARAMS.wageOther,
      DEFAULT_PARAMS.laborBenefits,
      DEFAULT_PARAMS.ppiCurrent,
      DEFAULT_PARAMS.residueRecovFracWT,
      DEFAULT_PARAMS.residueRecovFracCTL
    );
    
    // Run FRCS
    const frcsResult: FrcsOutputs = getFrcsOutputs(frcsInputs);
    
    // Validate result
    const isValid = 
      frcsResult?.total?.costPerGT &&
      !isNaN(frcsResult.total.costPerGT) &&
      frcsResult.total.costPerGT > 0 &&
      frcsResult.total.costPerGT < 500;
    
    // Build row (ALWAYS - success or failure!)
    const row: CompleteTrainingRow = {
      cluster_no: cluster.cluster_no,
      treatmentid: cluster.treatmentid,
      harvestSystem: system,
      slope: cluster.slope || 0,
      center_elevation: cluster.center_elevation || 0,
      mean_yarding: cluster.mean_yarding || 0,
      area: cluster.area || 0,
      stem6to9_tonsacre: cluster.stem6to9_tonsacre || 0,
      stem4to6_tonsacre: cluster.stem4to6_tonsacre || 0,
      stem9plus_tonsacre: cluster.stem9plus_tonsacre || 0,
      branch_tonsacre: cluster.branch_tonsacre || 0,
      foliage_tonsacre: cluster.foliage_tonsacre || 0,
      wood_density: cluster.wood_density || 0,
      burn_probability: cluster.burn_probability || 0,
      
      // Validity
      is_valid: isValid ? 1 : 0,
      error_type: isValid ? null : 'invalid_result',
      
      // Outputs (null if invalid)
      total_costPerAcre: isValid ? (frcsResult.total.costPerAcre || null) : null,
      total_costPerGT: isValid ? (frcsResult.total.costPerGT || null) : null,
      total_yieldPerAcre: isValid ? (frcsResult.total.yieldPerAcre || null) : null,
      total_dieselPerAcre: isValid ? (frcsResult.total.dieselPerAcre || null) : null,
      total_gasolinePerAcre: isValid ? (frcsResult.total.gasolinePerAcre || null) : null,
      residual_costPerAcre: isValid ? (frcsResult.residual.costPerAcre || null) : null,
      residual_costPerGT: isValid ? (frcsResult.residual.costPerGT || null) : null,
      residual_yieldPerAcre: isValid ? (frcsResult.residual.yieldPerAcre || null) : null,
      residual_dieselPerAcre: isValid ? (frcsResult.residual.dieselPerAcre || null) : null,
      residual_gasolinePerAcre: isValid ? (frcsResult.residual.gasolinePerAcre || null) : null,
    };
    
    allRows.push(row);
    
  } catch (error: any) {
    // Even errors get saved!
    const errorMsg = error.message || 'Unknown error';
    
    const row: CompleteTrainingRow = {
      cluster_no: cluster.cluster_no,
      treatmentid: cluster.treatmentid,
      harvestSystem: system,
      slope: cluster.slope || 0,
      center_elevation: cluster.center_elevation || 0,
      mean_yarding: cluster.mean_yarding || 0,
      area: cluster.area || 0,
      stem6to9_tonsacre: cluster.stem6to9_tonsacre || 0,
      stem4to6_tonsacre: cluster.stem4to6_tonsacre || 0,
      stem9plus_tonsacre: cluster.stem9plus_tonsacre || 0,
      branch_tonsacre: cluster.branch_tonsacre || 0,
      foliage_tonsacre: cluster.foliage_tonsacre || 0,
      wood_density: cluster.wood_density || 0,
      burn_probability: cluster.burn_probability || 0,
      
      // Mark as invalid
      is_valid: 0,
      error_type: categorizeError(errorMsg),
      
      // All outputs null
      total_costPerAcre: null,
      total_costPerGT: null,
      total_yieldPerAcre: null,
      total_dieselPerAcre: null,
      total_gasolinePerAcre: null,
      residual_costPerAcre: null,
      residual_costPerGT: null,
      residual_yieldPerAcre: null,
      residual_dieselPerAcre: null,
      residual_gasolinePerAcre: null,
    };
    
    allRows.push(row);
  }
}

/**
 * Write batch to file
 */
function writeBatch(
  rows: CompleteTrainingRow[],
  outputFile: string
) {
  if (rows.length > 0) {
    const content = rows.map(row => formatCsvRow(row)).join('');
    fs.appendFileSync(outputFile, content);
  }
}

/**
 * Main execution
 */
async function generateTrainingData() {
  console.log('='.repeat(70));
  console.log('FRCS ML TRAINING DATA - INTELLIGENT MODEL VERSION');
  console.log('Saves BOTH successful and failed runs');
  console.log('='.repeat(70));
  
  const startTime = Date.now();
  
  // Output file (ONE file for everything)
  const outputFile = 'frcs_training_complete.csv';
  
  // Write header
  const header = [
    'cluster_no',
    'treatmentid',
    'harvestSystem',
    'slope',
    'center_elevation',
    'mean_yarding',
    'area',
    'stem6to9_tonsacre',
    'stem4to6_tonsacre',
    'stem9plus_tonsacre',
    'branch_tonsacre',
    'foliage_tonsacre',
    'wood_density',
    'burn_probability',
    'is_valid',
    'error_type',
    'total_costPerAcre',
    'total_costPerGT',
    'total_yieldPerAcre',
    'total_dieselPerAcre',
    'total_gasolinePerAcre',
    'residual_costPerAcre',
    'residual_costPerGT',
    'residual_yieldPerAcre',
    'residual_dieselPerAcre',
    'residual_gasolinePerAcre'
  ].join(',') + '\n';
  
  fs.writeFileSync(outputFile, header);
  
  console.log('\n✅ File initialized');
  console.log(`   Output: ${outputFile}`);
  
  // Query database
  console.log('\n📂 Querying database...');
  
  try {
    // STREAMING VERSION: Get eligible cluster IDs first
    console.log('   Getting eligible cluster IDs...');
    const eligibleClusters = await knex('clusters_with_fire_probability')
      .select('cluster_no')
      .where('year', 2025)
      .whereNotNull('slope')
      .whereNotNull('wood_density')
      .whereRaw('(stem6to9_tonsacre + stem4to6_tonsacre + stem9plus_tonsacre) > 5')
      .distinct()
      .limit(100000);  // ← Can be ANY number now!
    
    interface EligibleCluster {
      cluster_no: string;
    }
    
    const allClusterIds: string[] = eligibleClusters.map((c: EligibleCluster) => c.cluster_no);
    console.log(`✅ Found ${allClusterIds.length} eligible clusters\n`);
    
    // Estimate total rows
    const estimatedCombos = allClusterIds.length * 11;  // Assume 11 treatments avg
    const estimatedRows = estimatedCombos * HARVEST_SYSTEMS.length;
    
    console.log(`   Estimated cluster-treatment combos: ~${estimatedCombos}`);
    console.log(`   Estimated total rows: ~${estimatedRows}`);
    console.log(`   (Includes both successes AND failures)\n`);
    
    // STREAMING: Process in chunks
    const CLUSTER_CHUNK_SIZE = 5000;  // Process 5k clusters at a time (safe for whereIn)
    const DATA_CHUNK_SIZE = 1000;     // Fetch 1000 cluster-treatment combos per query
    const BATCH_SIZE = 100;           // Write to disk every 100 combos
    
    let totalProcessedCount = 0;
    let totalValid = 0;
    let totalInvalid = 0;
    
    // Start progress bar (use estimated total)
    progressBar.start(estimatedCombos, 0, {
      valid: 0,
      invalid: 0,
      rate: '0.0'
    });
    
    // Process cluster IDs in chunks to avoid parameter limit
    for (let clusterOffset = 0; clusterOffset < allClusterIds.length; clusterOffset += CLUSTER_CHUNK_SIZE) {
      const clusterIdChunk = allClusterIds.slice(clusterOffset, clusterOffset + CLUSTER_CHUNK_SIZE);
      
      console.log(`\n   Processing cluster chunk ${Math.floor(clusterOffset / CLUSTER_CHUNK_SIZE) + 1}/${Math.ceil(allClusterIds.length / CLUSTER_CHUNK_SIZE)} (${clusterIdChunk.length} clusters)...`);
      
      // Now stream through this cluster chunk's data
      let dataOffset = 0;
      let hasMore = true;
      
      while (hasMore) {
        // Load next chunk of cluster-treatment combinations for this cluster subset
        const chunk = await knex('clusters_with_fire_probability')
          .select(
            'cluster_no',
            'treatmentid',
            'area',
            'slope',
            'center_elevation',
            'center_lat',
            'center_lng',
            'mean_yarding',
            'landing_lat',
            'landing_lng',
            'stem6to9_tonsacre',
            'stem4to6_tonsacre',
            'stem9plus_tonsacre',
            'branch_tonsacre',
            'foliage_tonsacre',
            'wood_density',
            'burn_probability'
          )
          .where('year', 2025)
          .whereNotNull('slope')
          .whereNotNull('wood_density')
          .whereRaw('(stem6to9_tonsacre + stem4to6_tonsacre + stem9plus_tonsacre) > 5')
          .whereIn('cluster_no', clusterIdChunk)  // ← Only 5k IDs at a time
          .orderBy('cluster_no')
          .orderBy('treatmentid')
          .limit(DATA_CHUNK_SIZE)
          .offset(dataOffset);
        
        if (chunk.length === 0) {
          hasMore = false;
          break;
        }
        
        // Process this chunk
        let currentBatch: CompleteTrainingRow[] = [];
        
        for (const clusterTreatment of chunk) {
          // Process each system for this cluster-treatment combo
          for (const system of HARVEST_SYSTEMS) {
            processClusterTreatmentSystem(
              clusterTreatment as TreatedCluster,
              system,
              currentBatch
            );
          }
          
          totalProcessedCount++;
          
          // Write batch periodically
          if (totalProcessedCount % BATCH_SIZE === 0) {
            // Count valid/invalid in this batch
            const batchValid = currentBatch.filter(r => r.is_valid === 1).length;
            const batchInvalid = currentBatch.filter(r => r.is_valid === 0).length;
            
            totalValid += batchValid;
            totalInvalid += batchInvalid;
            
            writeBatch(currentBatch, outputFile);
            
            // Clear batch
            currentBatch = [];
            
            // Update progress bar
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = (totalProcessedCount * HARVEST_SYSTEMS.length) / elapsed;
            
            progressBar.update(totalProcessedCount, {
              valid: totalValid,
              invalid: totalInvalid,
              rate: rate.toFixed(1)
            });
          }
        }
        
        // Write remaining in this data chunk
        if (currentBatch.length > 0) {
          const batchValid = currentBatch.filter(r => r.is_valid === 1).length;
          const batchInvalid = currentBatch.filter(r => r.is_valid === 0).length;
          
          totalValid += batchValid;
          totalInvalid += batchInvalid;
          
          writeBatch(currentBatch, outputFile);
          
          // Update progress bar
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = (totalProcessedCount * HARVEST_SYSTEMS.length) / elapsed;
          
          progressBar.update(totalProcessedCount, {
            valid: totalValid,
            invalid: totalInvalid,
            rate: rate.toFixed(1)
          });
        }
        
        dataOffset += DATA_CHUNK_SIZE;
      }
    }
    
    // Stop progress bar
    progressBar.stop();
    
    await knex.destroy();
    
    const totalTime = (Date.now() - startTime) / 1000;
    const totalRows = totalValid + totalInvalid;
    
    // Add newlines to ensure clean separation from progress bar
    console.log('\n\n' + '='.repeat(70));
    console.log('✅ GENERATION COMPLETE!');
    console.log('='.repeat(70));
    console.log(`\n📊 Results:`);
    console.log(`   Cluster-treatment combos: ${totalProcessedCount.toLocaleString()}`);
    console.log(`   Total rows: ${totalRows.toLocaleString()}`);
    console.log(`   Valid rows: ${totalValid.toLocaleString()} (${(totalValid/totalRows*100).toFixed(1)}%)`);
    console.log(`   Invalid rows: ${totalInvalid.toLocaleString()} (${(totalInvalid/totalRows*100).toFixed(1)}%)`);
    console.log(`   Total time: ${Math.round(totalTime)}s`);
    console.log(`   Rate: ${(totalRows / totalTime).toFixed(1)} rows/sec`);
    console.log(`\n📁 Output file:`);
    console.log(`   ${outputFile}`);
    console.log(`\n🧠 Next step: Train intelligent model!`);
    console.log(`   python train_intelligent_model.py`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    await knex.destroy();
    throw error;
  }
}

// Run
generateTrainingData().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});