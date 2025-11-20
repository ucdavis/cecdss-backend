"""
FRCS ML Training - Production Version
Trains on actual @ucdavis/frcs outputs with total/residual structure

Input: frcs_training_labels.csv (from TypeScript generator)
Output: Trained models for instant cost prediction
"""

import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import joblib
import json
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

# Create output directories
Path("models").mkdir(exist_ok=True)
Path("results").mkdir(exist_ok=True)

# Harvest system encoding (matching FRCS package names)
HARVEST_SYSTEMS = {
    'Ground-Based Mech WT': 0,
    'Ground-Based Manual WT': 1,
    'Ground-Based Manual Log': 2,
    'Ground-Based CTL': 3,
    'Cable Manual WT/Log': 4,
    'Cable Manual WT': 5,
    'Cable Manual Log': 6,
    'Cable CTL': 7,
    'Helicopter Manual Log': 8,
    'Helicopter CTL': 9
}


def load_and_clean_data(filepath='frcs_training_labels.csv'):
    """Load and clean FRCS training labels"""
    
    print("📂 Loading FRCS labels...")
    df = pd.read_csv(filepath)
    
    print(f"   Loaded: {len(df):,} rows")
    
    # Remove rows with invalid costs
    print("\n🧹 Cleaning data...")
    initial_count = len(df)
    
    # Remove NaN costs
    df = df.dropna(subset=['total_costPerGT', 'residual_costPerGT'])
    print(f"   Removed {initial_count - len(df):,} rows with NaN costs")
    
    # Remove unrealistic costs
    initial_count = len(df)
    df = df[(df['total_costPerGT'] > 0) & (df['total_costPerGT'] < 500)]
    print(f"   Removed {initial_count - len(df):,} rows with unrealistic costs")
    
    # Remove very low biomass clusters
    initial_count = len(df)
    df['total_biomass'] = (
        df['stem6to9_tonsacre'] + 
        df['stem4to6_tonsacre'] + 
        df['stem9plus_tonsacre']
    )
    df = df[df['total_biomass'] > 5.0]
    print(f"   Removed {initial_count - len(df):,} rows with biomass < 5 tons/acre")
    
    # Encode harvest system
    df['harvestSystem_encoded'] = df['harvestSystem'].map(HARVEST_SYSTEMS)
    
    # Encode treatment ID
    df['treatmentid_int'] = df['treatmentid'].astype(int)
    
    print(f"\n✅ Final dataset: {len(df):,} rows")
    print(f"   Unique clusters: {df['cluster_no'].nunique():,}")
    print(f"   Treatments: {sorted(df['treatmentid_int'].unique())}")
    print(f"   Systems: {df['harvestSystem'].nunique()}")
    
    return df


def analyze_distribution(df):
    """Analyze cost distribution"""
    
    print("\n📊 Cost Distribution Analysis:")
    
    # Total cost
    print(f"\n   TOTAL COST (all operations):")
    print(f"      Mean: ${df['total_costPerGT'].mean():.2f}/GT")
    print(f"      Median: ${df['total_costPerGT'].median():.2f}/GT")
    print(f"      Std: ${df['total_costPerGT'].std():.2f}/GT")
    
    # Residual cost (feedstock only)
    print(f"\n   RESIDUAL COST (feedstock only):")
    print(f"      Mean: ${df['residual_costPerGT'].mean():.2f}/GT")
    print(f"      Median: ${df['residual_costPerGT'].median():.2f}/GT")
    print(f"      Std: ${df['residual_costPerGT'].std():.2f}/GT")
    
    # By system
    print(f"\n   By Harvest System (Total Cost):")
    system_costs = df.groupby('harvestSystem')['total_costPerGT'].agg(['mean', 'median', 'count'])
    for system, row in system_costs.iterrows():
        print(f"      {system:<30} Mean: ${row['mean']:>6.2f}  (n={int(row['count']):,})")


def prepare_features(df):
    """Prepare feature matrix"""
    
    print("\n🔧 Preparing features...")
    
    feature_cols = [
        'slope',
        'center_elevation',
        'mean_yarding',
        'stem6to9_tonsacre',
        'stem4to6_tonsacre',
        'stem9plus_tonsacre',
        'branch_tonsacre',
        'foliage_tonsacre',
        'wood_density',
        'treatmentid_int',
        'site_class',
        'harvestSystem_encoded',
        'total_biomass'
    ]
    
    X = df[feature_cols].copy()
    X = X.fillna(X.median())
    
    print(f"\n   Features: {len(feature_cols)}")
    for col in feature_cols[:5]:  # Show first 5
        print(f"      {col:<25} mean={X[col].mean():>8.2f}  std={X[col].std():>8.2f}")
    print(f"      ... {len(feature_cols) - 5} more features")
    
    return X, feature_cols


def train_models(df):
    """Train ML models for FRCS prediction"""
    
    print("\n" + "="*70)
    print("TRAINING ML MODELS")
    print("="*70)
    
    # Prepare features
    X, feature_cols = prepare_features(df)
    
    # Split
    print(f"\n✂️  Splitting data (80/20)...")
    X_train, X_test = train_test_split(X, test_size=0.2, random_state=42)
    print(f"   Training: {len(X_train):,} rows")
    print(f"   Testing: {len(X_test):,} rows")
    
    # Scale
    print(f"\n⚖️  Scaling features...")
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    joblib.dump(scaler, 'models/scaler.pkl')
    joblib.dump(feature_cols, 'models/feature_cols.pkl')
    print(f"   ✅ Scaler saved")
    
    # Target variables
    targets = {
        'total_cost': ['total_costPerAcre', 'total_costPerGT'],
        'residual_cost': ['residual_costPerAcre', 'residual_costPerGT'],
        'yield': ['total_yieldPerAcre', 'residual_yieldPerAcre'],
        'diesel': ['total_dieselPerAcre', 'residual_dieselPerAcre']
    }
    
    all_metrics = {}
    
    # Train models for each target
    for category, target_list in targets.items():
        print(f"\n" + "="*70)
        print(f"{category.upper()} MODELS")
        print("="*70)
        
        category_metrics = {}
        
        for target in target_list:
            if target not in df.columns:
                continue
                
            print(f"\n🎯 Training: {target}")
            
            y_train = df.loc[X_train.index, target]
            y_test = df.loc[X_test.index, target]
            
            # XGBoost model
            model = xgb.XGBRegressor(
                n_estimators=500,
                max_depth=8,
                learning_rate=0.03,
                subsample=0.8,
                colsample_bytree=0.8,
                min_child_weight=3,
                gamma=0.1,
                random_state=42,
                n_jobs=-1
            )
            
            # Train
            model.fit(
                X_train_scaled,
                y_train,
                eval_set=[(X_test_scaled, y_test)],
                early_stopping_rounds=50,
                verbose=False
            )
            
            # Predict
            y_pred = model.predict(X_test_scaled)
            
            # Metrics
            r2 = r2_score(y_test, y_pred)
            mae = mean_absolute_error(y_test, y_pred)
            rmse = mean_squared_error(y_test, y_pred, squared=False)
            mape = np.mean(np.abs((y_test - y_pred) / (y_test + 1e-6))) * 100
            
            print(f"   R² = {r2:.4f}")
            print(f"   MAE = {mae:.2f}")
            print(f"   RMSE = {rmse:.2f}")
            print(f"   MAPE = {mape:.2f}%")
            
            # Save model
            model.save_model(f'models/ml_{target}.json')
            category_metrics[target] = {
                'r2': r2, 'mae': mae, 'rmse': rmse, 'mape': mape
            }
        
        all_metrics[category] = category_metrics
    
    # Validation: Total cost per GT
    print("\n" + "="*70)
    print("PRIMARY METRIC: TOTAL COST PER GT")
    print("="*70)
    
    model_total = xgb.XGBRegressor()
    model_total.load_model('models/ml_total_costPerGT.json')
    
    y_test_total = df.loc[X_test.index, 'total_costPerGT'].values
    y_pred_total = model_total.predict(X_test_scaled)
    
    errors = np.abs(y_test_total - y_pred_total)
    
    print(f"\n💰 Total Cost Per GT:")
    print(f"   R² = {r2_score(y_test_total, y_pred_total):.4f}")
    print(f"   MAE = ${mean_absolute_error(y_test_total, y_pred_total):.2f}/GT")
    print(f"\n   Error Distribution:")
    print(f"      Within $2/GT: {(errors < 2).sum() / len(errors) * 100:.1f}%")
    print(f"      Within $5/GT: {(errors < 5).sum() / len(errors) * 100:.1f}%")
    print(f"      Within $10/GT: {(errors < 10).sum() / len(errors) * 100:.1f}%")
    
    # Save all metrics
    with open('results/model_metrics.json', 'w') as f:
        json.dump(all_metrics, f, indent=2)
    
    print(f"\n✅ Metrics saved: results/model_metrics.json")
    
    # Feature importance
    importance_df = pd.DataFrame({
        'feature': feature_cols,
        'importance': model_total.feature_importances_
    }).sort_values('importance', ascending=False)
    
    importance_df.to_csv('results/feature_importance.csv', index=False)
    
    print(f"\n📊 Top 5 Important Features:")
    for idx, row in importance_df.head(5).iterrows():
        print(f"   {row['feature']:<25} {row['importance']:.4f}")
    
    # Final summary
    print("\n" + "="*70)
    print("✅ TRAINING COMPLETE!")
    print("="*70)
    
    print(f"\n📦 Models saved:")
    print(f"   Total cost models: 2")
    print(f"   Residual cost models: 2")
    print(f"   Yield models: 2")
    print(f"   Diesel models: 2")
    
    total_r2 = all_metrics['total_cost']['total_costPerGT']['r2']
    total_mae = all_metrics['total_cost']['total_costPerGT']['mae']
    
    print(f"\n🎯 Performance:")
    print(f"   Total Cost R² = {total_r2:.4f}")
    print(f"   Total Cost MAE = ${total_mae:.2f}/GT")
    
    if total_r2 > 0.94 and total_mae < 5.0:
        print(f"\n✅ EXCELLENT - Ready for deployment!")
    elif total_r2 > 0.90 and total_mae < 10.0:
        print(f"\n⚠️  GOOD - May benefit from more data")
    else:
        print(f"\n❌ NEEDS IMPROVEMENT")
    
    print(f"\n🚀 Next step:")
    print(f"   python predict_frcs_costs.py --cluster_no=123456")
    
    return all_metrics


if __name__ == "__main__":
    try:
        df = load_and_clean_data('frcs_training_labels.csv')
        analyze_distribution(df)
        metrics = train_models(df)
        print("\n✅ SUCCESS!")
        
    except FileNotFoundError:
        print("\n❌ ERROR: frcs_training_labels.csv not found")
        print("   Run TypeScript generator first:")
        print("   npx ts-node generate_frcs_training_labels_production.ts")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()