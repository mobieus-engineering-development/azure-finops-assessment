# Quick Start Guide - AZ Cost Assessment

Run an interactive, read-only Azure cost assessment. Collection time depends on the reporting window, pagination and Azure throttling.

## Prerequisites

- **Node.js** ≥18.0.0 (LTS recommended — [nodejs.org](https://nodejs.org/))
- **Azure CLI** (latest) — [Install guide](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- An **Azure subscription** with the **Cost Management Reader** and **Reader** roles assigned to your account

That's it! The tool will guide you through the rest interactively.

## Installation

### 1. Clone and Install

```bash
git clone https://github.com/mobieus10036/az-cost-assessment.git
cd az-cost-assessment
npm install
```

### 2. Run the Tool

```bash
npm start
```

That's it! The tool will:

1. ✅ Check if Azure CLI is installed
2. 🔐 Prompt you to login to Azure (if needed)
3. 📋 Show your subscriptions and let you choose
4. 💾 Save your selection automatically
5. 📊 Run the cost analysis

## First Run Example

```
╔═══════════════════════════════════════════════════════════╗
║       Azure Cost Analyzer - Interactive Setup            ║
╚═══════════════════════════════════════════════════════════╝

🔍 Checking prerequisites...

✅ Azure CLI is installed

⚠️  Not logged in to Azure

Would you like to login now? (Y/n): y

🔐 Opening Azure login in your browser...
Please complete the authentication in your browser.

✅ Successfully logged in to Azure!

📋 Available Subscriptions:

1. Production Subscription
   ID: xxxxx-xxxxx-xxxxx-xxxxx
   State: Enabled

2. Development Subscription
   ID: yyyyy-yyyyy-yyyyy-yyyyy
   State: Enabled

Select subscription number (or press Enter for default): 1

✅ Configuration saved to .env file

╔═══════════════════════════════════════════════════════════╗
║                   Setup Complete! 🎉                      ║
╚═══════════════════════════════════════════════════════════╝

Starting cost analysis...
```

## What Happens Next

After setup, the analyzer will:

Queries are paced to reduce throttling; allow several minutes for collection.

1. Query 30 days of historical costs
2. Analyze trends and patterns
3. Detect cost anomalies
4. Reconcile daily, service and resource costs
5. Disclose scope, currency and data limitations; forecasts and savings are unavailable
6. Save reports to `reports/` folder

## Output

Local JSON and HTML reports contain observed ActualCost, completed UTC reporting dates, the returned currency and source limitations. Forecasts and savings estimates are unavailable. Invalid or inconsistent billing results stop report generation. See the [financial contract](docs/trustworthy-numbers.md) for supported comparisons and current limitations.

## Running Again

After initial setup, just run:

```bash
npm start
```

It will use your saved configuration automatically.

## Switching Subscriptions

Want to analyze a different subscription?

```powershell
# Delete the saved config
Remove-Item .env

# Run again - you'll be prompted to choose
npm start
```

Or manually run the setup:

```bash
npm run setup
```

## Troubleshooting

### "Azure CLI is not installed"

Install it from: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli

### "No subscriptions found"

Make sure you have access to at least one Azure subscription. Check in the Azure Portal or run:

```bash
az account list
```

### Login issues

```bash
# Clear Azure CLI cache
az account clear

# Try again
npm start
```

### "ts-node is not recognized"

This happens if dependencies weren't installed correctly:

```bash
# Reinstall dependencies
npm install

# Try again
npm start
```

## Configuration Options

Edit `config/default.json` to customize analysis settings:

```json
{
  "analysis": {
    "historicalDays": 30,
    "forecastDays": 30,
    "anomalyThresholdPercent": 20
  }
}
```

## Advanced: Manual Configuration

If you prefer to configure manually (not recommended):

1. Create `.env` file:
```bash
AZURE_SUBSCRIPTION_ID=your-subscription-id
AZURE_TENANT_ID=your-tenant-id
```

2. Login to Azure:
```bash
az login
az account set --subscription "your-subscription-id"
```

3. Run:
```bash
npm start
```

## That's It!

No configuration files to edit. No subscription IDs to copy/paste. Just run `npm start` and follow the prompts!

---

**Happy cost optimizing!** 💰📊
