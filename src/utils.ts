import { Stream, MemoryStream, default as xs } from 'xstream'

// export function failure<ErrorT> (r$: Stream<any>): Stream<ErrorT> {
//   return r$.map(xs.empty).flatten().replaceError(xs.of)
// } 

export const failure = <ErrorT>(r$: Stream<any>): Stream<ErrorT> => 
  r$.map(xs.empty).flatten().replaceError(xs.of)

export const success = <T>(r$: Stream<T>): Stream<T> => 
  r$.replaceError(xs.empty)

