// Thompson Sampling for Bayesian Price Optimization
// Source: github.com/Cassxbt/talos

export class ThompsonPricer {
  constructor() {
    this.alpha = 1;
    this.beta = 1;
  }
  
  sample() {
    const alphaGamma = this.randomGamma(this.alpha, 1);
    const betaGamma = this.randomGamma(this.beta, 1);
    return alphaGamma / (alphaGamma + betaGamma);
  }
  
  randomGamma(shape, scale) {
    if (shape < 1) {
      return this.randomGamma(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }
    
    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);
    
    while (true) {
      let x = this.randn();
      let v = 1 + c * x;
      
      if (v <= 0) continue;
      
      v = v * v * v;
      let u = Math.random();
      
      if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
    }
  }
  
  randn() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  
  update(purchased) {
    if (purchased) this.alpha += 1;
    else this.beta += 1;
  }
  
  getPriceBand(basePrice = 0.001) {
    const conversionRate = this.sample();
    const explorationBonus = Math.random() * 0.1;
    
    return {
      price: basePrice * (1 + (conversionRate * 0.5) + explorationBonus),
      confidence: Math.abs(this.alpha / (this.alpha + this.beta) - 0.5) * 2,
      params: { alpha: this.alpha, beta: this.beta }
    };
  }
}

export function calculateLoyalPrice(purchaseCount, successRate) {
  const pricer = new ThompsonPricer();
  pricer.alpha = 1 + (purchaseCount * successRate);
  pricer.beta = 1 + (purchaseCount * (1 - successRate));
  
  const band = pricer.getPriceBand(0.001);
  return Math.max(0.0005, Math.min(0.0009, band.price));
}

export default async function handler(req, res) {
  const { purchases, successRate, basePrice } = req.query || {};
  
  const pricer = new ThompsonPricer();
  pricer.alpha = 1 + (Number(purchases || 0) * Number(successRate || 0.5));
  pricer.beta = 1 + (Number(purchases || 0) * (1 - Number(successRate || 0.5)));
  
  const band = pricer.getPriceBand(Number(basePrice) || 0.001);
  
  return res.json({
    kind: 'thompson-price',
    optimalPrice: calculateLoyalPrice(Number(purchases || 0), Number(successRate || 0.5)),
    distribution: band,
    note: 'Bayesian price optimization via Beta-Thompson sampling (Talos inspired)',
    algorithm: 'Thompson Sampling with ε-greedy exploration'
  });
}
