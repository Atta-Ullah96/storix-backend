import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    family: 0,
  },
});


redisClient.on("error", (error) => {
  console.error("Redis connection error:", error);
});

await redisClient.connect()



export { redisClient };