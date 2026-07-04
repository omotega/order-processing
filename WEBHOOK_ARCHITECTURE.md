# Paystack Webhook Handler - Senior Architect Design

## Overview
This webhook handling system is designed with enterprise-grade reliability, security, and scalability in mind. It follows senior architect principles for production-ready financial systems.

## Architecture Principles

### 1. **Security First**
- ✅ **Signature Verification**: All webhooks verified using HMAC-SHA512
- ✅ **Idempotency**: Prevents duplicate processing using Redis locks
- ✅ **Input Validation**: Zod schemas for payload validation
- ✅ **Error Handling**: Always returns 200 to prevent retry storms

### 2. **Reliability & Consistency**
- ✅ **Database Transactions**: Atomic operations for data consistency
- ✅ **Idempotency Keys**: Redis-based deduplication
- ✅ **Comprehensive Logging**: Structured logging for debugging
- ✅ **Graceful Degradation**: System continues working even if webhook fails

### 3. **Observability**
- ✅ **Structured Logging**: JSON logs with correlation IDs
- ✅ **Monitoring Endpoints**: Health checks and status endpoints
- ✅ **Error Tracking**: Detailed error logging with context
- ✅ **Audit Trail**: Complete transaction history

## Webhook Flow

### Transfer Success Flow
```
1. Paystack sends webhook → /webhook/paystack
2. Verify signature (security)
3. Check idempotency (prevent duplicates)
4. Find payment record by reference
5. Update payment status → COMPLETED
6. Update transaction status → COMPLETED
7. Deduct wallet balance
8. Log success
```

### Transfer Failure Flow
```
1. Paystack sends webhook → /webhook/paystack
2. Verify signature (security)
3. Check idempotency (prevent duplicates)
4. Find payment record by reference
5. Update payment status → FAILED
6. Update transaction status → FAILED
7. Keep wallet balance unchanged
8. Log failure reason
```

### Transfer Reversal Flow
```
1. Paystack sends webhook → /webhook/paystack
2. Verify signature (security)
3. Check idempotency (prevent duplicates)
4. Find payment record by reference
5. Update payment status → REVERSED
6. Update transaction status → REVERSED
7. Refund wallet balance
8. Log reversal
```

## API Endpoints

### Webhook Endpoints
- `POST /webhook/paystack` - Main Paystack webhook handler
- `POST /webhook/test` - Test webhook for development

### Monitoring Endpoints
- `GET /webhook/status/:reference` - Get webhook processing status
- `GET /webhook/health` - Health check endpoint

## Configuration

### Environment Variables
```env
PAYSTACK_SECRET_KEY=sk_test_xxx
PAYSTACK_PUBLIC_KEY=pk_test_xxx
```

### Redis Configuration
- **Idempotency TTL**: 24 hours
- **Key Pattern**: `webhook:{event}:{reference}`

## Error Handling Strategy

### 1. **Always Return 200**
```typescript
// Prevents Paystack from retrying failed webhooks
return { status: 'error', message: 'Webhook processing failed' };
```

### 2. **Idempotency on Errors**
```typescript
// Remove lock on error to allow retry
await this.redisService.del(idempotencyKey);
```

### 3. **Comprehensive Logging**
```typescript
this.logger.error('Webhook processing failed', {
  error: error.message,
  payload: payload,
  headers: headers,
});
```

## Database Schema Impact

### Payment Table Updates
- `status`: PENDING → COMPLETED/FAILED/REVERSED
- `processedAt`: Timestamp when webhook processed
- `failureReason`: Reason for failure
- `metadata`: Additional webhook data

### Transaction Table Updates
- `status`: INITIATED → COMPLETED/FAILED/REVERSED
- `balanceAfter`: Updated based on webhook result
- `metadata`: Webhook processing details

### Wallet Table Updates
- `balance`: Deducted on success, refunded on reversal
- No change on failure

## Security Considerations

### 1. **Signature Verification**
```typescript
const expectedSignature = crypto
  .createHmac('sha512', appConfig.paystack.secretKey)
  .update(payload)
  .digest('hex');
```

### 2. **Input Validation**
```typescript
@UsePipes(new ZodValidationPipe(webhookValidation.paystack))
```

### 3. **Rate Limiting**
- Consider adding rate limiting for webhook endpoints
- Monitor for unusual webhook patterns

## Monitoring & Alerting

### Key Metrics to Monitor
- Webhook processing success rate
- Average processing time
- Failed webhook count
- Idempotency hit rate

### Alerting Thresholds
- Webhook failure rate > 5%
- Processing time > 30 seconds
- Missing signature errors
- Database transaction failures

## Testing Strategy

### 1. **Unit Tests**
- Test each webhook event handler
- Test signature verification
- Test idempotency logic

### 2. **Integration Tests**
- Test complete webhook flow
- Test database transactions
- Test Redis operations

### 3. **Load Tests**
- Test webhook processing under load
- Test Redis performance
- Test database performance

## Deployment Considerations

### 1. **Redis Configuration**
- Ensure Redis persistence for idempotency keys
- Configure appropriate memory limits
- Set up Redis clustering for high availability

### 2. **Database Configuration**
- Ensure proper indexing on reference fields
- Configure connection pooling
- Set up read replicas for monitoring queries

### 3. **Logging Configuration**
- Configure log aggregation (ELK stack)
- Set up log retention policies
- Configure log level based on environment

## Troubleshooting Guide

### Common Issues

#### 1. **Webhook Not Processing**
- Check signature verification
- Check Redis connectivity
- Check database connectivity
- Review logs for errors

#### 2. **Duplicate Processing**
- Check idempotency key generation
- Check Redis TTL settings
- Review webhook retry patterns

#### 3. **Database Inconsistencies**
- Check transaction rollback logs
- Verify foreign key constraints
- Review concurrent access patterns

### Debug Commands
```bash
# Check webhook status
curl -H "Authorization: Bearer <token>" \
  http://localhost:3200/api/v1/webhook/status/<reference>

# Check health
curl http://localhost:3200/api/v1/webhook/health
```

## Future Enhancements

### 1. **Queue System**
- Implement message queue for webhook processing
- Add retry mechanisms with exponential backoff
- Implement dead letter queues

### 2. **Event Sourcing**
- Implement event sourcing for audit trails
- Add event replay capabilities
- Implement CQRS pattern

### 3. **Advanced Monitoring**
- Add Prometheus metrics
- Implement distributed tracing
- Add custom dashboards

This webhook system is designed to handle production workloads with high reliability, security, and observability. It follows enterprise patterns and can scale to handle thousands of webhooks per minute.
