import { FastifyInstance, FastifyReply, FastifyRequest, RegisterOptions } from 'fastify';
import { MOVIES } from '@consumet/extensions';
import { StreamingServers } from '@consumet/extensions/dist/models';

import cache from '../../utils/cache';
import { redis } from '../../main';
import { Redis } from 'ioredis';

const routes = async (fastify: FastifyInstance, _options: RegisterOptions) => {
  const moviehdwatch = new MOVIES.MovieHdWatch();

  fastify.get('/', (_, reply) => {
    reply.status(200).send({
      intro:
        "Welcome to the moviehdwatch provider: check out the provider's website @ https://movieshd.watch/",
      routes: [
        '/:query',
        '/info',
        '/watch',
        '/servers',
        '/recent-shows',
        '/recent-movies',
        '/trending',
        '/country',
        '/genre',
      ],
      documentation: 'https://docs.consumet.org/#tag/moviehdwatch',
    });
  });

  fastify.get('/:query', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = decodeURIComponent((request.params as { query: string }).query);
    const page = (request.query as { page?: number }).page ?? 1;

    const res = redis
      ? await cache.fetch(
          redis as Redis,
          `moviehdwatch:${query}:${page}`,
          async () => await moviehdwatch.search(query, page),
          60 * 60 * 6,
        )
      : await moviehdwatch.search(query, page);

    reply.status(200).send(res);
  });

  fastify.get('/recent-shows', async (_req: FastifyRequest, reply: FastifyReply) => {
    const res = redis
      ? await cache.fetch(
          redis as Redis,
          `moviehdwatch:recent-shows`,
          async () => await moviehdwatch.fetchRecentTvShows(),
          60 * 60 * 3,
        )
      : await moviehdwatch.fetchRecentTvShows();

    reply.status(200).send(res);
  });

  fastify.get('/recent-movies', async (_req: FastifyRequest, reply: FastifyReply) => {
    const res = redis
      ? await cache.fetch(
          redis as Redis,
          `moviehdwatch:recent-movies`,
          async () => await moviehdwatch.fetchRecentMovies(),
          60 * 60 * 3,
        )
      : await moviehdwatch.fetchRecentMovies();

    reply.status(200).send(res);
  });

  fastify.get('/trending', async (request: FastifyRequest, reply: FastifyReply) => {
    const type = (request.query as { type?: string }).type;
    try {
      if (!type) {
        const res = {
          results: [
            ...(await moviehdwatch.fetchTrendingMovies()),
            ...(await moviehdwatch.fetchTrendingTvShows()),
          ],
        };
        return reply.status(200).send(res);
      }

      const res = redis
        ? await cache.fetch(
            redis as Redis,
            `moviehdwatch:trending:${type}`,
            async () =>
              type === 'tv'
                ? await moviehdwatch.fetchTrendingTvShows()
                : await moviehdwatch.fetchTrendingMovies(),
            60 * 60 * 3,
          )
        : type === 'tv'
          ? await moviehdwatch.fetchTrendingTvShows()
          : await moviehdwatch.fetchTrendingMovies();

      reply.status(200).send(res);
    } catch (error) {
      reply.status(500).send({
        message:
          'Something went wrong. Please try again later. or contact the developers.',
      });
    }
  });

  fastify.get('/info', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.query as { id?: string }).id;
    if (!id) return reply.status(400).send({ message: 'id is required' });

    try {
      const res = redis
        ? await cache.fetch(
            redis as Redis,
            `moviehdwatch:info:${id}`,
            async () => await moviehdwatch.fetchMediaInfo(id),
            60 * 60 * 3,
          )
        : await moviehdwatch.fetchMediaInfo(id);

      reply.status(200).send(res);
    } catch (err) {
      reply.status(500).send({
        message:
          'Something went wrong. Please try again later. or contact the developers.',
      });
    }
  });

  fastify.get('/watch', async (request: FastifyRequest, reply: FastifyReply) => {
    const episodeId = (request.query as { episodeId?: string }).episodeId;
    const mediaId = (request.query as { mediaId?: string }).mediaId;
    const server = (request.query as { server?: StreamingServers }).server;

    if (!episodeId) return reply.status(400).send({ message: 'episodeId is required' });
    if (!mediaId) return reply.status(400).send({ message: 'mediaId is required' });
    if (server && !Object.values(StreamingServers).includes(server))
      return reply.status(400).send({ message: 'Invalid server query' });

    try {
      const res = redis
        ? await cache.fetch(
            redis as Redis,
            `moviehdwatch:watch:${episodeId}:${mediaId}:${server}`,
            async () => await moviehdwatch.fetchEpisodeSources(episodeId, mediaId, server),
            60 * 30,
          )
        : await moviehdwatch.fetchEpisodeSources(episodeId, mediaId, server);

      reply.status(200).send(res);
    } catch (err) {
      reply
        .status(500)
        .send({ message: 'Something went wrong. Please try again later.' });
    }
  });

  fastify.get('/servers', async (request: FastifyRequest, reply: FastifyReply) => {
    const episodeId = (request.query as { episodeId?: string }).episodeId;
    const mediaId = (request.query as { mediaId?: string }).mediaId;

    if (!episodeId) return reply.status(400).send({ message: 'episodeId is required' });
    if (!mediaId) return reply.status(400).send({ message: 'mediaId is required' });

    try {
      const res = redis
        ? await cache.fetch(
            redis as Redis,
            `moviehdwatch:servers:${episodeId}:${mediaId}`,
            async () => await moviehdwatch.fetchEpisodeServers(episodeId, mediaId),
            60 * 30,
          )
        : await moviehdwatch.fetchEpisodeServers(episodeId, mediaId);

      reply.status(200).send(res);
    } catch (error) {
      reply.status(500).send({
        message:
          'Something went wrong. Please try again later. or contact the developers.',
      });
    }
  });

  fastify.get(
    '/country/:country',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const country = (request.params as { country: string }).country;
      const page = (request.query as { page?: number }).page ?? 1;
      try {
        const res = redis
          ? await cache.fetch(
              redis as Redis,
              `moviehdwatch:country:${country}:${page}`,
              async () => await moviehdwatch.fetchByCountry(country, page),
              60 * 60 * 3,
            )
          : await moviehdwatch.fetchByCountry(country, page);

        reply.status(200).send(res);
      } catch (error) {
        reply.status(500).send({
          message:
            'Something went wrong. Please try again later. or contact the developers.',
        });
      }
    },
  );

  fastify.get('/genre/:genre', async (request: FastifyRequest, reply: FastifyReply) => {
    const genre = (request.params as { genre: string }).genre;
    const page = (request.query as { page?: number }).page ?? 1;
    try {
      const res = redis
        ? await cache.fetch(
            redis as Redis,
            `moviehdwatch:genre:${genre}:${page}`,
            async () => await moviehdwatch.fetchByGenre(genre, page),
            60 * 60 * 3,
          )
        : await moviehdwatch.fetchByGenre(genre, page);

      reply.status(200).send(res);
    } catch (error) {
      reply.status(500).send({
        message:
          'Something went wrong. Please try again later. or contact the developers.',
      });
    }
  });
};

export default routes;
