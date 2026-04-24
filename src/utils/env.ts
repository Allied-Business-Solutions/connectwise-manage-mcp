/**
 * Environment variable loading with hard-fail validation.
 * Called once at startup — missing vars abort immediately with a clear message.
 */

export interface CwmEnv {
  site: string;
  companyId: string;
  publicKey: string;
  privateKey: string;
  clientId: string;
  enableRawTools: boolean;
  maxPages: number;
}

function require(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        `Set it in your .env file or Claude Desktop config.\n` +
        `See .env.example for reference.`
    );
  }
  return val.trim();
}

export function loadEnv(): CwmEnv {
  const site = require('CWM_SITE');
  const companyId = require('CWM_COMPANY_ID');
  const publicKey = require('CWM_PUBLIC_KEY');
  const privateKey = require('CWM_PRIVATE_KEY');
  const clientId = require('CWM_CLIENT_ID');

  const enableRawTools = process.env['CWM_ENABLE_RAW_TOOLS'] === 'true';
  const maxPages = parseInt(process.env['CWM_MAX_PAGES'] ?? '20', 10);

  return { site, companyId, publicKey, privateKey, clientId, enableRawTools, maxPages };
}
