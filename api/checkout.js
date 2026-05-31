// api/checkout.js
// Vercel Serverless Function — creates a Stripe Checkout session
// Stripe secret key is stored in Vercel environment variables, never in code

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    // Build Stripe line items from cart
    const line_items = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.brand ? `${item.brand} — ${item.title}` : item.title,
          description: [
            item.size      ? `Size: ${item.size}`           : null,
            item.condition ? `Condition: ${item.condition}` : null,
          ].filter(Boolean).join(' · ') || undefined,
          // Use first image if available
          images: item.image ? [item.image] : [],
          metadata: {
            item_id:   String(item.id),
            size:      item.size      || '',
            condition: item.condition || '',
          },
        },
        // Stripe wants price in cents
        unit_amount: Math.round(item.price * 100),
      },
      quantity: 1,
    }));

    // Determine base URL for redirect
    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || 'https://sisukas-store.vercel.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      // Where to send the customer after payment
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/shop.html`,
      // Collect shipping address
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'SE', 'NO', 'FI', 'DK'],
      },
      // Shipping rate options
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 1499, currency: 'usd' },
            display_name: 'Standard Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 10 },
            },
          },
        },
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 2999, currency: 'usd' },
            display_name: 'Express Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 2 },
              maximum: { unit: 'business_day', value: 3 },
            },
          },
        },
      ],
      // Metadata for your records
      metadata: {
        source: 'sisukas-store',
        item_count: String(items.length),
      },
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
