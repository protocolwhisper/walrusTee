module seal_example::access_control {
    use sui::object;
    use sui::transfer;
    use sui::tx_context;

    public struct AccessControl has key {
        id: object::UID,
        owner: address,
    }

    public fun new(ctx: &mut tx_context::TxContext) {
        let access_control = AccessControl {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
        };
        transfer::share_object(access_control);
    }

    public entry fun seal_approve(_id: vector<u8>, access_control: &AccessControl, _ctx: &mut tx_context::TxContext) {
        // For demo, allow all. In production, check access_control.owner == tx_context::sender(ctx)
    }
} 