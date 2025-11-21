import { FastifyInstance, FastifyReply, FastifyRequest, RegisterOptions } from 'fastify';
import { MOVIES } from '@consumet/extensions';
import { StreamingServers } from '@consumet/extensions/dist/models';

import cache from '../../utils/cache';
import { redis } from '../../main';
import { Redis } from 'ioredis';

const routes = async (fastify: FastifyInstance, _options: RegisterOptions) => {
  const kissasian = new MOVIES.KissAsian();

  fastify.get('/', (_, reply) => {
    reply.status(200).send({
      intro:
        "Welcome to the kissasian provider: check out the provider's website @ https://kissasian.mx/",
      routes: ['/:query', '/info', '/watch', '/servers'],
      documentation: 'https://docs.consumet.org/#tag/kissasian',
    });
  });

  fastify.get('/:query', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = decodeURIComponent((request.params as { query: string }).query);
    const page = (request.query as { page?: number }).page ?? 1;

    const res = redis
      ? await cache.fetch(
          redis as Redis,
          `kissasian:${query}:${page}`,
          async () => await kissasian.search(query, page),
          60 * 60 * 6,
        )
      : await kissasian.search(query, page);

    reply.status(200).send(res);
  });

  fastify.get('/info', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.query as { id?: string }).id;
    if (!id) return reply.status(400).send({ message: 'id is required' });

    try {
      const res = redis
        ? await cache.fetch(
            redis as Redis,
            `kissasian:info:${id}`,
            async () => await kissasian.fetchMediaInfo(id),
            60 * 60 * 3,
          )
        : await kissasian.fetchMediaInfo(id);

      reply.status(200).send(res);
    } catch (err) {
      reply
        .status(500)
        .send({ message: 'Something went wrong. Please try again later.' });
    }
  });

  fastify.get('/watch', async (request: FastifyRequest, reply: FastifyReply) => {
    const episodeId = (request.query as { episodeId?: string }).episodeId;
    const server = (request.query as { server?: StreamingServers }).server;

    if (!episodeId) return reply.status(400).send({ message: 'episodeId is required' });
    if (server && !Object.values(StreamingServers).includes(server))
      return reply.status(400).send({ message: 'Invalid server query' });

    try {
      const res = redis
        ? await cache.fetch(
            redis as Redis,
            `kissasian:watch:${episodeId}:${server}`,
            async () => await kissasian.fetchEpisodeSources(episodeId, server),
            60 * 30,
          )
        : await kissasian.fetchEpisodeSources(episodeId, server);

      reply.status(200).send(res);
    } catch (err) {
      reply
        .status(500)
        .send({ message: 'Something went wrong. Please try again later.' });
    }
  });

  fastify.get('/servers', async (request: FastifyRequest, reply: FastifyReply) => {
    const episodeId = (request.query as { episodeId?: string }).episodeId;
    if (!episodeId) return reply.status(400).send({ message: 'episodeId is required' });

    try {
      const res = redis
        ? await cache.fetch(
            redis as Redis,
            `kissasian:servers:${episodeId}`,
            async () => await kissasian.fetchEpisodeServers(episodeId),
            60 * 30,
          )
        : await kissasian.fetchEpisodeServers(episodeId);

      reply.status(200).send(res);
    } catch (err) {
      reply
        .status(500)
        .send({ message: 'Something went wrong. Please try again later.' });
    }
  });
};

export default routes;
