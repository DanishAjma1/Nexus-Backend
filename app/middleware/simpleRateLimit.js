export const rateLimit = (options = {}) => {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes default
  const max = options.max || 100; // Limit each IP to 100 requests per windowMs
  const message = options.message || "Too many requests from this IP, please try again later.";
  
  const requests = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const now = Date.now();

    if (!requests.has(ip)) {
      requests.set(ip, { count: 1, startTime: now });
      return next();
    }

    const requestData = requests.get(ip);

    if (now - requestData.startTime > windowMs) {
      // Reset window
      requestData.count = 1;
      requestData.startTime = now;
      requests.set(ip, requestData);
      return next();
    }

    if (requestData.count >= max) {
      return res.status(429).json({ message });
    }

    requestData.count++;
    requests.set(ip, requestData);
    next();
  };
};
