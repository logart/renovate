import { logger } from '../../logger';
import got from '../../util/got';
import { ReleaseResult, PkgReleaseConfig } from '../common';
import { DATASOURCE_FAILURE } from '../../constants/error-messages';

interface CdnjsAsset {
  version: string;
  files: string[];
}

interface CdnjsResponse {
  homepage?: string;
  repository?: {
    type: 'git' | unknown;
    url?: string;
  };
  assets?: CdnjsAsset[];
}

export async function getPkgReleases({
  lookupName,
}: Partial<PkgReleaseConfig>): Promise<ReleaseResult | null> {
  // istanbul ignore if
  if (!lookupName) {
    logger.warn('CDNJS lookup failure: empty lookupName');
    return null;
  }

  const [depName, ...assetParts] = lookupName.split('/');
  const assetName = assetParts.join('/');
  const url = `https://api.cdnjs.com/libraries/${depName}`;

  try {
    const res = await got(url, { json: true });

    const cdnjsResp: CdnjsResponse = res.body;

    if (!cdnjsResp || !cdnjsResp.assets) {
      logger.warn({ depName }, `Invalid CDNJS response`);
      return null;
    }

    const { assets, homepage, repository } = cdnjsResp;

    const releases = assets
      .filter(({ files }) => files.indexOf(assetName) !== -1)
      .map(({ version }) => ({ version }));

    const result: ReleaseResult = { releases };

    if (homepage) result.homepage = homepage;
    if (repository && repository.url) result.sourceUrl = repository.url;

    return result;
  } catch (err) {
    const errorData = { depName, err };

    if (
      err.statusCode === 429 ||
      (err.statusCode >= 500 && err.statusCode < 600)
    ) {
      logger.warn({ lookupName, err }, `Cdnjs registry failure`);
      throw new Error(DATASOURCE_FAILURE);
    }

    if (err.statusCode === 401) {
      logger.debug(errorData, 'Authorization error');
    } else if (err.statusCode === 404) {
      logger.debug(errorData, 'Package lookup error');
    } else {
      logger.warn(errorData, 'Cdnjs lookup failure: Unknown error');
    }
  }

  return null;
}
