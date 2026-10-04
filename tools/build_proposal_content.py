"""Usage: python tools/build_proposal_content.py .   (run from the project root)
Builds proposal-app/content/up.json: the proposal's UP semester, copied out of the
main content so the backup app has no dependency on it."""
import json, sys, copy
root = sys.argv[1]
load = lambda p: json.load(open(f'{root}/{p}', encoding='utf-8'))
core = load('content/core.json')
ft = load('content/chapters/first_term.json')
up = load('content/institutions/up.json')

# Proposal weeks 1-8, plus the cards it names: surprise expense, accommodation scam,
# commute events for commuters, the gym debit order and paying a friend back.
WANT = ['FT-01', 'FT-02', 'FT-03', 'FT-04', 'FT-04D', 'FT-05', 'FT-06', 'FT-06B', 'FT-R2', 'FT-R4', 'FT-R6']
by_id = {e['id']: e for e in ft['events']}
events = [copy.deepcopy(by_id[i]) for i in WANT]
events += [copy.deepcopy(e) for e in core['events'] if e.get('pool') in ('surprise', 'repayment', 'subscriptions')]

# Adaptive rule from the proposal: the loneliness card is more likely if the player joined nothing.
for e in events:
    if e['id'] == 'FT-06':
        e['conditions'] = {'flags': ['joined_nothing']}
        e['adaptive'] = {'en': 'You met the loneliness card in week 6 because you joined nothing on Societies Day.',
                         'zu': 'Uhlangabezane nekhadi lesizungu ngesonto lesi-6 ngoba awujoyinanga lutho ngoSuku Lwezinhlangano.'}
    if e['id'] == 'FT-04':
        e['adaptive'] = {'en': 'Home asked for money because you said your family may need support.',
                         'zu': 'Ekhaya bacele imali ngoba uthe umndeni wakho ungadinga ukusekelwa.'}
    if e['id'] == 'RP-01':
        e['adaptive'] = {'en': 'Your friend asked for their money back because you borrowed in week 3.',
                         'zu': 'Umngane wakho ucele imali yakhe ngoba uboleke ngesonto lesi-3.'}
    if e['id'] == 'FT-R6':
        e['adaptive'] = {'en': 'The gym debit order came back because you signed the contract on Societies Day.',
                         'zu': 'I-debit order yejimu ibuyile ngoba usayine isivumelwano ngoSuku Lwezinhlangano.'}
    if e['id'] == 'FT-02':
        for c in e['choices']:
            if c['id'] == 'cant_afford':
                c['effects']['connection'] = 1
    e.pop('slot', None)
    e.pop('pool', None) if e.get('pool') not in ('surprise',) else None

def support_ids(x, acc):
    if isinstance(x, dict):
        for k, v in x.items():
            if k == 'support' and isinstance(v, list):
                acc.update(v)
            else:
                support_ids(v, acc)
    elif isinstance(x, list):
        for v in x:
            support_ids(v, acc)
    return acc

used = support_ids(events, set()) | set(core['plan']['coreSupport']) | {'counselling', 'higher_health', 'mentor', 'societies', 'commuters', 'library'}
support = {}
for sid in sorted(used):
    card = copy.deepcopy(core['support'].get(sid, {}))
    card.update(copy.deepcopy(up['support'].get(sid, {})))
    if card:
        support[sid] = card

out = {
    'version': 1,
    'institution': {k: up[k] for k in ('id', 'name', 'short', 'campus', 'city', 'area')},
    'start': core['start'],
    'courses': core['courses'],
    'housing': [h for h in core['housing'] if h['id'] in ('residence', 'private_rental', 'commuting')],
    'funding': core['funding'],
    'origins': core['origins'],
    'incomePresets': core['incomePresets'],
    'friday': {**core['friday'], 'weeks': [2, 4, 6]},
    'tests': ft['tests'],
    'testsCard': by_id['FT-07'],
    'resultsCard': by_id['FT-RES'],
    'results': core['results'],
    'plan': core['plan'],
    'anytimeHelp': core['anytimeHelp'],
    'support': support,
    # One main card each week; the first whose conditions match is used.
    'schedule': {'1': ['FT-01'], '2': ['FT-02'], '3': ['FT-03'], '4': ['FT-04', 'FT-04D'],
                 '5': ['FT-05'], '6': ['FT-06', 'FT-06B']},
    # Extra cards, each placed in one random week from its list if the player qualifies.
    'extras': [
        {'pool': 'surprise', 'weeks': [2, 4, 5, 6]},
        {'id': 'FT-R2', 'weeks': [3, 4, 5]},
        {'id': 'FT-R4', 'weeks': [2, 3, 4]},
        {'id': 'FT-R6', 'weeks': [4, 5]},
        {'id': 'RP-01', 'weeks': [5, 6]},
        {'id': 'SUB-01', 'weeks': [5, 6]},
    ],
    'events': events,
}
json.dump(out, open(f'{root}/proposal-app/content/up.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('events', [e['id'] for e in events])
print('support', sorted(support))
