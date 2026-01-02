"""
Autocomplete views for django-autocomplete-light integration.
"""

from django.http import JsonResponse

from dal import autocomplete

from .aggregators.registry import AggregatorRegistry


class FeedIdentifierAutocomplete(autocomplete.Select2ListView):
    """
    Autocomplete view for Feed identifier field.

    Returns identifier choices based on the selected aggregator type.
    Uses forward parameter 'aggregator' to determine which aggregator's
    choices to return.

    Allows custom input via data-tags attribute.
    """

    def get_list(self):
        """
        Get the list of identifier choices for the selected aggregator.

        Returns:
            List of (value, label) tuples for the autocomplete dropdown
        """
        # Get aggregator type from forwarded field
        aggregator_type = self.forwarded.get("aggregator", None)

        if not aggregator_type:
            # No aggregator selected yet, return empty list
            return []

        try:
            # Get aggregator class from registry
            aggregator_class = AggregatorRegistry.get(aggregator_type)

            # Get identifier choices from aggregator
            choices = aggregator_class.get_identifier_choices()

            # Filter by query if provided
            if self.q:
                choices = [
                    (value, label)
                    for value, label in choices
                    if self.q.lower() in label.lower() or self.q.lower() in value.lower()
                ]

            return choices

        except KeyError:
            # Unknown aggregator type
            return []

    def get(self, request, *args, **kwargs):
        """
        Override get to return proper JSON format with values.

        Select2 expects {id, text} format. We customize to use actual
        identifier URLs as IDs instead of array indices.
        """
        choices = self.get_list()

        # Format choices for Select2: [{"id": value, "text": label}, ...]
        results = [{"id": value, "text": label} for value, label in choices]

        return JsonResponse({"results": results, "pagination": {"more": False}})
