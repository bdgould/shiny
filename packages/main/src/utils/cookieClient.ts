import type { AxiosInstance } from 'axios'
import { wrapper } from 'axios-cookiejar-support'

/**
 * Attach cookie-jar support to an axios instance.
 *
 * axios-cookiejar-support is ESM, so its types reference axios's ESM
 * declarations, while this CommonJS package sees axios's CommonJS ones.
 * They describe the same runtime object, but TypeScript treats them as
 * unrelated types, so the conversion is made once here.
 */
export function withCookieJar(instance: AxiosInstance): AxiosInstance {
  type WrapperInput = Parameters<typeof wrapper>[0]
  return wrapper(instance as unknown as WrapperInput) as unknown as AxiosInstance
}
