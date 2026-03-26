/**
 * Cloudflare Pages Function — /api/verify-license
 * Verifica licencias de Lemon Squeezy sin exponer la API Key
 *
 * Variables de entorno requeridas:
 *   LEMONSQUEEZY_API_KEY = tu_api_key_test_o_live
 */

const VALID_VARIANTS = ['1451161', '1451168'];

export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://aiworksuite.pro',
  };

  try {
    const { license_key } = await request.json();
    if (!license_key) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'missing_key' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!env.LEMONSQUEEZY_API_KEY) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'server_error' }),
        { status: 503, headers: corsHeaders }
      );
    }

    const lsRes = await fetch(
      'https://api.lemonsqueezy.com/v1/licenses/validate',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ license_key }),
      }
    );

    const data = await lsRes.json();
    const variantId = data?.meta?.variant_id?.toString();
    const status    = data?.license_key?.status;

    if (
      !data.valid ||
      !VALID_VARIANTS.includes(variantId) ||
      (status !== 'active' && status !== 'on_trial')
    ) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'invalid_or_inactive' }),
        { status: 200, headers: corsHeaders }
      );
    }

    const plan = variantId === '1451168' ? 'annual' : 'monthly';

    return new Response(
      JSON.stringify({
        valid: true,
        plan,
        status,
        expires: data?.license_key?.expires_at || null,
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ valid: false, reason: 'server_error' }),
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://aiworksuite.pro',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
