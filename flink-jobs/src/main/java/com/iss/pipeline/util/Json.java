package com.iss.pipeline.util;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.api.common.serialization.DeserializationSchema;
import org.apache.flink.api.common.serialization.SerializationSchema;
import org.apache.flink.api.common.typeinfo.TypeInformation;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Jackson-backed serialization schemas for Kafka sources and sinks. */
public final class Json {

    private Json() {}

    /** Shared, thread-safe mapper. */
    public static ObjectMapper mapper() {
        return Holder.MAPPER;
    }

    private static final class Holder {
        static final ObjectMapper MAPPER = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    /**
     * Lenient deserializer: a malformed record yields null rather than killing
     * the job. Callers filter nulls out immediately after the source.
     */
    public static <T> DeserializationSchema<T> deserializer(Class<T> type) {
        return new DeserializationSchema<>() {
            private transient ObjectMapper om;

            @Override
            public T deserialize(byte[] message) {
                if (message == null || message.length == 0) return null;
                if (om == null) {
                    om = new ObjectMapper()
                            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
                }
                try {
                    return om.readValue(message, type);
                } catch (IOException e) {
                    return null;
                }
            }

            @Override
            public boolean isEndOfStream(T nextElement) {
                return false;
            }

            @Override
            public TypeInformation<T> getProducedType() {
                return TypeInformation.of(type);
            }
        };
    }

    /** Serializes a POJO to compact UTF-8 JSON. */
    public static <T> SerializationSchema<T> serializer() {
        return new SerializationSchema<>() {
            private transient ObjectMapper om;

            @Override
            public byte[] serialize(T element) {
                if (om == null) om = new ObjectMapper();
                try {
                    return om.writeValueAsBytes(element);
                } catch (Exception e) {
                    return ("{\"error\":\"serialization failed: "
                            + e.getMessage() + "\"}").getBytes(StandardCharsets.UTF_8);
                }
            }
        };
    }

    /** Extracts a Kafka message key from an element. Must be serializable. */
    public interface KeyExtractor<T> extends java.io.Serializable {
        String key(T element);
    }

    /**
     * Serializes a message key. Keying matters here: position records share one
     * key so they stay strictly ordered, while telemetry is keyed per channel
     * so channels can fan out across partitions and still keep per-channel order.
     */
    public static <T> SerializationSchema<T> keySerializer(KeyExtractor<T> extractor) {
        return new SerializationSchema<>() {
            @Override
            public byte[] serialize(T element) {
                String k = extractor.key(element);
                return (k == null ? "" : k).getBytes(StandardCharsets.UTF_8);
            }
        };
    }
}
