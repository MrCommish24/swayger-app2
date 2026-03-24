import { getUncachableStripeClient } from '../server/stripeClient';

async function seedElite8Boost() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log('Connected to Stripe...');

    const existing = await stripe.products.search({
      query: "name:'Elite 8 2X Boost' AND active:'true'",
    });

    if (existing.data.length > 0) {
      console.log('Elite 8 2X Boost product already exists.');
      console.log(`Product ID: ${existing.data[0].id}`);

      const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
      if (prices.data.length > 0) {
        console.log(`Price ID: ${prices.data[0].id}`);
        console.log(`Amount: $${(prices.data[0].unit_amount ?? 0) / 100}`);
      }
      return;
    }

    const product = await stripe.products.create({
      name: 'Elite 8 2X Boost',
      description: 'Double your Swayger Points for all Elite 8 special picks (upset, blowout, high scorer). One-time purchase. Applies to the 2026 Elite 8 round only.',
      metadata: {
        type: 'elite8_boost',
        tournament: 'march_madness_2026',
        round: 'elite-8',
      },
    });
    console.log(`Created product: ${product.name} (${product.id})`);

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 500,
      currency: 'usd',
    });
    console.log(`Created price: $5.00 one-time (${price.id})`);
    console.log('\nSave these IDs — you\'ll need them for the checkout endpoint:');
    console.log(`STRIPE_ELITE8_PRODUCT_ID=${product.id}`);
    console.log(`STRIPE_ELITE8_PRICE_ID=${price.id}`);

  } catch (err: any) {
    console.error('Error seeding Stripe products:', err.message);
    process.exit(1);
  }
}

seedElite8Boost();
