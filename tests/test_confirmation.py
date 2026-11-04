import pytest

from libretto.confirmation import (
    ConfirmationBlocked,
    ConfirmationState,
    DeliveryAck,
    accept_confirmation,
    confirmation_fingerprint,
    invalidate_confirmation,
    record_delivery,
)


def permit():
    return ConfirmationState('booking','request-a','fingerprint','readback-1',3)


def test_explicit_delivery_allows_subsequent_acceptance():
    # Wording is deliberately not a policy input; only the bound delivery is authoritative.
    state=record_delivery(permit(),DeliveryAck('readback-1',3,True),current_request_id='request-a')
    result=accept_confirmation(state,current_request_id='request-a',current_fingerprint='fingerprint',
                               turn_id='approval',changed_fields=set())
    assert result.accepted_turn_id == 'approval'


@pytest.mark.parametrize('message,epoch,request_id',[
    ('other',3,'request-a'),('readback-1',2,'request-a'),('readback-1',3,'request-b'),
])
def test_wrong_message_request_or_epoch_cannot_confirm(message,epoch,request_id):
    with pytest.raises(ConfirmationBlocked):
        record_delivery(permit(),DeliveryAck(message,epoch,True),current_request_id=request_id)


def test_partial_delivery_cannot_confirm():
    state=record_delivery(permit(),DeliveryAck('readback-1',3,False),current_request_id='request-a')
    with pytest.raises(ConfirmationBlocked,match='delivered'):
        accept_confirmation(state,current_request_id='request-a',current_fingerprint='fingerprint',
                            turn_id='approval',changed_fields=set())


def test_correction_and_acceptance_same_turn_requires_new_readback():
    state=record_delivery(permit(),DeliveryAck('readback-1',3,True),current_request_id='request-a')
    with pytest.raises(ConfirmationBlocked,match='changed'):
        accept_confirmation(state,current_request_id='request-a',current_fingerprint='fingerprint',
                            turn_id='approval',changed_fields={'address'})
    with pytest.raises(ConfirmationBlocked,match='changed'):
        accept_confirmation(state,current_request_id='request-a',current_fingerprint='new-fingerprint',
                            turn_id='approval',changed_fields=set())


def test_refusal_and_new_request_clear_permission():
    state=permit()
    assert invalidate_confirmation(state) is None
    with pytest.raises(ConfirmationBlocked,match='request'):
        accept_confirmation(state,current_request_id='request-b',current_fingerprint='fingerprint',
                            turn_id='approval',changed_fields=set())


def test_fingerprint_is_bound_to_policy_request_and_all_protected_values():
    first=confirmation_fingerprint('booking','request-a',{'address':'7 Test','window':'morning'},['address','window'])
    assert first and first==confirmation_fingerprint('booking','request-a',{'window':'morning','address':'7 Test'},['window','address'])
    assert first!=confirmation_fingerprint('booking','request-b',{'address':'7 Test','window':'morning'},['address','window'])
    assert first!=confirmation_fingerprint('transfer','request-a',{'address':'7 Test','window':'morning'},['address','window'])
    assert confirmation_fingerprint('booking','request-a',{'address':'7 Test'},['address','window']) is None


def test_duplicate_complete_delivery_does_not_revoke_accepted_permission():
    state=record_delivery(permit(),DeliveryAck('readback-1',3,True),current_request_id='request-a')
    state=accept_confirmation(state,current_request_id='request-a',current_fingerprint='fingerprint',
                              turn_id='approval',changed_fields=set())
    repeated=record_delivery(state,DeliveryAck('readback-1',3,True),current_request_id='request-a')
    assert repeated.accepted_turn_id == 'approval'
