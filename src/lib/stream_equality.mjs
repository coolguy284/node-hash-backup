const HIGH_WATER_MARK = 65_536;

export async function streamsEqual(streams, highWaterMark = HIGH_WATER_MARK) {
  if (!Array.isArray(streams)) {
    throw new Error(`streams not array: ${streams}`);
  }
  
  if (streams.length == 0) {
    return true;
  } else if (streams.length == 1) {
    streams[0].destroy();
    return true;
  }
  
  // for (let i = 0; i < streams.length; i++) {
  //   if (!(streams[i] instanceof ReadableStream)) {
  //     throw new Error(`streams[${i}] not ReadableStream: ${typeof streams[i]}`);
  //   }
  // }
  
  return await new Promise((r, j) => {
    let trackedListeners = [];
    
    const addTrackedListener = (obj, event, listener) => {
      obj.on(event, listener);
      trackedListeners.push([obj, event, listener]);
    };
    
    const closeAllListeners = () => {
      for (const [ obj, event, listener ] of trackedListeners) {
        obj.off(event, listener);
      }
    };
    
    const closeEverything = () => {
      closeAllListeners();
      for (const stream of streams) {
        stream.destroy();
      }
    };
    
    const callResolve = val => {
      r(val);
      closeEverything();
    };
    
    const callReject = err => {
      j(err);
      closeEverything();
    };
    
    const onErrorListener = err => {
      callReject(err);
    };
    
    let streamsData = new Map(
      streams.map(
        stream =>
          [
            stream,
            {
              buffers: [],
              bufferLength: 0,
              totalBytesRead: 0,
            }
          ]
      )
    );
    
    const onReadableListener = () => {
      for (const stream of streams) {
        if (!stream.readable) {
          continue;
        }
        
        let streamData = streamsData.get(stream);
        
        if (streamData.bufferLength > highWaterMark) {
          continue;
        }
        
        let data;
        
        while ((data = stream.read(highWaterMark)) != null) {
          streamData.buffers.push(data);
          streamData.bufferLength += data.length;
          streamData.totalBytesRead += data.length;
          
          if (streamData.bufferLength > highWaterMark) {
            break;
          }
        }
      }
      
      consumeAvailable();
    };
    
    const onEndListener = stream => {
      let streamData = streamsData.get(stream);
      
      let readableEndedCount = 1;
      
      for (const otherStream of streams) {
        if (otherStream != stream) {
          let otherStreamData = streamsData.get(otherStream);
          
          if (
            otherStreamData.totalBytesRead > streamData.totalBytesRead ||
            otherStream.readableEnded && otherStreamData.totalBytesRead < streamData.totalBytesRead
          ) {
            callResolve(false);
            return;
          } else if (otherStream.readableEnded) {
            readableEndedCount++;
          }
        }
      }
      
      if (readableEndedCount == streams.length) {
        consumeAvailable(true);
      }
    };
    
    const condenseBuffers = () => {
      for (let streamData of streamsData.values()) {
        if (streamData.buffers.length > 1) {
          streamData.buffers = [
            Buffer.concat(streamData.buffers),
          ];
        } else if (streamData.buffers.length == 0) {
          streamData.buffers = [
            Buffer.alloc(0),
          ];
        }
      }
    };
    
    const consumeAvailable = (final = false) => {
      condenseBuffers();
      
      const largestConsumableSize =
        Array.from(streamsData.values())
          .map(({ bufferLength }) => bufferLength)
          .reduce((a, c) => Math.min(a, c));
      
      let prevConsumeSlice = null;
      
      if (largestConsumableSize > 0) {
        for (let streamData of streamsData.values()) {
          const buffer = streamData.buffers[0];
          const consumeSlice = buffer.subarray(0, largestConsumableSize);
          
          if (buffer.length > largestConsumableSize) {
            streamData.buffers[0] = buffer.subarray(largestConsumableSize);
          } else {
            streamData.buffers.length = 0;
          }
          
          streamData.bufferLength -= largestConsumableSize;
          
          if (prevConsumeSlice == null) {
            prevConsumeSlice = consumeSlice;
          } else {
            if (!consumeSlice.equals(prevConsumeSlice)) {
              callResolve(false);
              return;
            }
          }
        }
      }
      
      if (final) {
        for (let streamData of streamsData.values()) {
          if (streamData.bufferLength != 0) {
            callResolve(false);
            return;
          }
        }
        
        callResolve(true);
        return;
      }
    };
    
    for (const stream of streams) {
      addTrackedListener(
        stream,
        'error',
        onErrorListener,
      );
      
      addTrackedListener(
        stream,
        'readable',
        onReadableListener,
      );
      
      addTrackedListener(
        stream,
        'end',
        onEndListener.bind(null, stream),
      );
    }
  });
}
